import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
type RouteHandler = (event: any, id?: string) => Promise<any>;
const tableName = process.env.TABLE_NAME;

const routeHandlers: Record<string, RouteHandler> = {
  "POST /assignments": async (event) => {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const { employeeId, projectId, role } = JSON.parse(event.body);

    if (!employeeId || !projectId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required fields: employeeId or projectId",
        }),
      };
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
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Employee ${employeeId} not found` }),
      };
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
      return {
        statusCode: 404,
        body: JSON.stringify({ message: `Project ${projectId} not found` }),
      };
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

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Employee assigned to project",
      }),
    };
  },

  "GET /employees/:id/projects": async (event, id) => {
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

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  },

  "GET /projects/:id/employees": async (event, id) => {
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

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  },

  "DELETE /assignments": async (event) => {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const { employeeId, projectId } = JSON.parse(event.body);

    if (!employeeId || !projectId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing employeeId or projectId" }),
      };
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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Unassigned employee from project" }),
    };
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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let statusCode = StatusCodes.OK;
  let body: string | object = "";

  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    const matched = matchRoute(method, path);
    if (!matched) throw new Error(`Unsupported route: ${method} ${path}`);

    body = await matched.handler(event, matched.id);
  } catch (err) {
    statusCode = StatusCodes.BAD_REQUEST;
    body = (err as Error).message;
  }

  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
};
