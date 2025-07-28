import { APIGatewayProxyHandler } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import { createResponse } from "../utils/response.js";
import { EmployeeEntity } from "../models/employee.js";
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
  "GET /employees": async () => {
    const { Items } = await AppTable.build(QueryCommand)
      .entities(EmployeeEntity)
      .query({
        partition: "EMPLOYEE",
        index: "GSI1",
      })
      .send();

    return createResponse(200, Items ?? []);
  },

  "GET /employees/:id": async (_event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing employee id" });
    }

    const { Item } = await EmployeeEntity.build(GetItemCommand)
      .key({ id })
      .options({ consistent: true })
      .send();

    if (!Item) {
      return createResponse(404, { message: "Employee not found" });
    }

    return createResponse(200, Item);
  },

  "POST /employees": async (event) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const body = JSON.parse(event.body);

    if (!body.name || !body.email || !body.start_date) {
      return createResponse(400, {
        message: "Missing required fields: name, email, start_date",
      });
    }

    const empId = uuidv4();

    const newEmployee = {
      id: empId,
      GSI1PK: "EMPLOYEE",
      GSI1SK: body.name,
      name: body.name,
      email: body.email,
      start_date: body.start_date,
      end_date: body.end_date,
      positions: body.positions,
      tech_stack: body.tech_stack,
    };

    await EmployeeEntity.build(PutItemCommand).item(newEmployee).send();

    return createResponse(201, {
      message: "Employee created",
      employee: newEmployee,
    });
  },

  "PUT /employees/:id": async (event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing employee id" });
    }

    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const body = JSON.parse(event.body);

    const updates: UpdateItemInput<typeof EmployeeEntity> = {
      id: id,
    };

    if (body.name) {
      updates.name = body.name;
      updates.GSI1SK = body.name;
    }
    if (body.email) updates.email = body.email;
    if (body.start_date) updates.start_date = body.start_date;
    if (body.end_date !== undefined) updates.end_date = body.end_date;
    if (body.positions) updates.positions = body.positions;
    if (body.tech_stack) updates.tech_stack = body.tech_stack;

    const { Attributes } = await EmployeeEntity.build(UpdateItemCommand)
      .item(updates)
      .options({ returnValues: "ALL_NEW" })
      .send();

    if (!Attributes) {
      return createResponse(404, { message: "Employee not found" });
    }
    return createResponse(200, {
      message: "Updated employee",
      employee: Attributes,
    });
  },

  "DELETE /employees/:id": async (_event, id) => {
    if (!id) {
      return createResponse(404, { message: "Missing employee id" });
    }

    const { Items: assignments } = await AppTable.build(QueryCommand)
      .entities(AssignmentEntity)
      .query({
        partition: `EMP#${id}`,
        range: { attr: "SK", beginsWith: "PROJ#" },
      })
      .send();

    if (assignments?.length) {
      const deleteRequests = assignments.map((assignment) =>
        AssignmentEntity.build(BatchDeleteRequest).key({
          employeeId: id,
          projectId: assignment.projectId,
        })
      );

      const batchCmd = AppTable.build(BatchWriteCommand).requests(
        ...deleteRequests
      );

      await executeBatchWrite(batchCmd);
    }

    await EmployeeEntity.build(DeleteItemCommand).key({ id }).send();

    return createResponse(200, {
      message: "Deleted employee and their assignments",
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
