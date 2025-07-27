import { APIGatewayProxyHandler } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
import { createResponse } from "../utils/response.js";
config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
type RouteHandler = (event: any, id?: string) => Promise<any>;
const tableName = process.env.TABLE_NAME;

const routeHandlers: Record<string, RouteHandler> = {
  "POST /assignments": async (event) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const { employeeId, projectId, role } = JSON.parse(event.body);

    if (!employeeId || !projectId) {
      return createResponse(400, {
        message: "Missing required fields: employeeId or projectId",
      });
    }

    const employee = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `EMP#${employeeId}`,
          SK: "PROFILE",
        },
      })
    );

    if (!employee.Item) {
      return createResponse(404, {
        message: `Employee ${employeeId} not found`,
      });
    }

    const project = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `PROJ#${projectId}`,
          SK: "DETAILS",
        },
      })
    );

    if (!project.Item) {
      return createResponse(404, { message: `Project ${projectId} not found` });
    }

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `EMP#${employeeId}`,
          SK: `PROJ#${projectId}`,
          GSI1PK: `PROJ#${projectId}`,
          GSI1SK: `EMP#${employeeId}`,
          role,
          assignedAt: new Date().toISOString(),
        },
      })
    );

    return createResponse(201, {
      message: "Employee assigned to project",
    });
  },

  "GET /employees/:id/projects": async (_event, id) => {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `EMP#${id}`,
          ":sk": "PROJ#",
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return createResponse(200, []);
    }

    const projectIds = result.Items.map((item) => item.SK.replace("PROJ#", ""));
    const projectKeys = projectIds.map((projId) => ({
      PK: `PROJ#${projId}`,
      SK: "DETAILS",
    }));

    const projectsResult = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName!]: {
            Keys: projectKeys,
          },
        },
      })
    );

    const projectNames = new Map();
    if (projectsResult.Responses && projectsResult.Responses[tableName!]) {
      projectsResult.Responses[tableName!].forEach((project) => {
        const projId = project.PK.replace("PROJ#", "");
        projectNames.set(projId, project.name);
      });
    }

    const enrichedAssignments = result.Items.map((assignment) => {
      const projId = assignment.SK.replace("PROJ#", "");
      return {
        ...assignment,
        projectName: projectNames.get(projId) || "Unknown Project",
      };
    });

    return createResponse(200, enrichedAssignments);
  },

  "GET /projects/:id/employees": async (_event, id) => {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression:
          "GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)",
        ExpressionAttributeValues: {
          ":gsi1pk": `PROJ#${id}`,
          ":gsi1sk": "EMP#",
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return createResponse(200, []);
    }

    const employeeIds = result.Items.map((item) =>
      item.GSI1SK.replace("EMP#", "")
    );
    const employeeKeys = employeeIds.map((empId) => ({
      PK: `EMP#${empId}`,
      SK: "PROFILE",
    }));

    const employeesResult = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName!]: {
            Keys: employeeKeys,
          },
        },
      })
    );

    const employeeNames = new Map();
    if (employeesResult.Responses && employeesResult.Responses[tableName!]) {
      employeesResult.Responses[tableName!].forEach((employee) => {
        const empId = employee.PK.replace("EMP#", "");
        employeeNames.set(empId, employee.name);
      });
    }

    const enrichedAssignments = result.Items.map((assignment) => {
      const empId = assignment.GSI1SK.replace("EMP#", "");
      return {
        ...assignment,
        employeeName: employeeNames.get(empId) || "Unknown Employee",
      };
    });

    return createResponse(200, enrichedAssignments);
  },

  "DELETE /assignments": async (event) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const { employeeId, projectId } = JSON.parse(event.body);

    if (!employeeId || !projectId) {
      return createResponse(400, {
        message: "Missing employeeId or projectId",
      });
    }

    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          PK: `EMP#${employeeId}`,
          SK: `PROJ#${projectId}`,
        },
      })
    );

    return createResponse(200, { message: "Unassigned employee from project" });
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
