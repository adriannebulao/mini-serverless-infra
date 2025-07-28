import { APIGatewayProxyHandler } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import { createResponse } from "../utils/response.js";
import { ProjectEntity } from "../models/project.js";
import {
  BatchDeleteRequest,
  BatchWriteCommand,
  DeleteItemCommand,
  executeBatchWrite,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  UpdateItemInput,
} from "dynamodb-toolbox";
import { AppTable } from "../models/table.js";
import { AssignmentEntity } from "../models/assignment.js";
config();

type RouteHandler = (event: any, id?: string) => Promise<any>;

const routeHandlers: Record<string, RouteHandler> = {
  "GET /projects": async () => {
    const { Items } = await AppTable.build(QueryCommand)
      .entities(ProjectEntity)
      .query({
        partition: "PROJECT",
        index: "GSI1",
      })
      .send();

    return createResponse(200, Items ?? []);
  },

  "GET /projects/:id": async (_event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing project id" });
    }

    const { Item } = await ProjectEntity.build(GetItemCommand)
      .key({ id })
      .options({ consistent: true })
      .send();

    if (!Item) {
      return createResponse(404, { message: "Project not found" });
    }

    return createResponse(200, Item);
  },

  "POST /projects": async (event) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const body = JSON.parse(event.body);

    if (!body.name || !body.start_date) {
      return createResponse(400, {
        message: "Missing required fields: name, start_date",
      });
    }

    const projId = uuidv4();

    const newProject = {
      id: projId,
      GSI1PK: "PROJECT",
      GSI1SK: body.name,
      name: body.name,
      description: body.description,
      start_date: body.start_date,
      end_date: body.end_date,
      tech_stack: body.tech_stack,
    };

    await ProjectEntity.build(PutItemCommand).item(newProject).send();

    return createResponse(201, {
      message: "Project created",
      project: newProject,
    });
  },

  "PUT /projects/:id": async (event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing project id" });
    }

    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const body = JSON.parse(event.body);

    const updates: UpdateItemInput<typeof ProjectEntity> = {
      id: id,
    };

    if (body.name) {
      updates.name = body.name;
      updates.GSI1SK = body.name;
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.start_date) updates.start_date = body.start_date;
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.tech_stack) updates.tech_stack = body.tech_stack;

    const { Attributes } = await ProjectEntity.build(UpdateItemCommand)
      .item(updates)
      .options({ returnValues: "ALL_NEW" })
      .send();

    if (!Attributes) {
      return createResponse(404, { message: "Project not found" });
    }

    return createResponse(200, {
      message: "Project updated successfully",
      project: Attributes,
    });
  },

  "DELETE /projects/:id": async (_event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing project id" });
    }

    const { Items: assignments } = await AppTable.build(QueryCommand)
      .entities(AssignmentEntity)
      .query({
        partition: `PROJ#${id}`,
        range: { attr: "GSI1SK", beginsWith: "EMP#" },
        index: "GSI1",
      })
      .send();

    if (assignments?.length) {
      const deleteRequests = assignments.map((assignment) =>
        AssignmentEntity.build(BatchDeleteRequest).key({
          employeeId: assignment.employeeId,
          projectId: id,
        })
      );

      const batchCmd = AppTable.build(BatchWriteCommand).requests(
        ...deleteRequests
      );

      await executeBatchWrite(batchCmd);
    }

    await ProjectEntity.build(DeleteItemCommand).key({ id }).send();

    return createResponse(200, {
      message: "Deleted project and related assignments",
    });
  },
};

const matchRoute = (method: string, path: string) => {
  for (const key in routeHandlers) {
    const [routeMethod, routePath] = key.split(" ");
    if (routeMethod !== method) continue;

    const match = path.match(
      new RegExp(`^${routePath.replace(":id", "([^/]+)")}$`)
    );
    if (match) {
      const id = match[1];
      return { handler: routeHandlers[key], id };
    }
  }
  return null;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path;

    const matched = matchRoute(method, path);
    if (!matched) {
      return createResponse(StatusCodes.NOT_FOUND, {
        message: `Unsupported route: ${method} ${path}`,
      });
    }

    return await matched.handler(event, matched.id);
  } catch (err) {
    return createResponse(StatusCodes.BAD_REQUEST, {
      message: (err as Error).message,
    });
  }
};
