import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
type RouteHandler = (event: any, id?: string) => Promise<any>;
const tableName = process.env.TABLE_NAME;

const routeHandlers: Record<string, RouteHandler> = {
  "GET /projects": async () => {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(PK, :pk)",
        ExpressionAttributeValues: { ":pk": "PROJ#" },
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(scanResult.Items ?? []),
    };
  },

  "GET /projects/:id": async (_event, id) => {
    const getResult = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `PROJ#${id}`,
          SK: "DETAILS",
        },
      })
    );

    if (!getResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Project not found" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(getResult.Item),
    };
  },

  "POST /projects": async (event) => {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : null;

    if (!body.name || !body.start_date) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required fields: name, start_date",
        }),
      };
    }
    const timestamp = new Date().toISOString();
    const projId = uuidv4();

    const newProj = {
      PK: `PROJ#${projId}`,
      SK: "DETAILS",
      name: body.name,
      description: body.description ?? null,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      tech_stack: body.tech_stack || [],
      created_at: timestamp,
      updated_at: timestamp,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: newProj,
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Project created",
        project: newProj,
      }),
    };
  },

  "PUT /projects/:id": async (event, id) => {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : null;
    const timestamp = new Date().toISOString();
    const key = { PK: `PROJ#${id}`, SK: "DETAILS" };

    const existing = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Project not found" }),
      };
    }

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `
        SET #name = :name,
            description = :description,
            start_date = :start_date,
            end_date = :end_date,
            tech_stack = :tech_stack,
            updated_at = :updated_at
      `,
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ExpressionAttributeValues: {
          ":name": body.name,
          ":description": body.description,
          ":start_date": body.start_date,
          ":end_date": body.end_date,
          ":tech_stack": body.tech_stack,
          ":updated_at": timestamp,
        },
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Updated project" }),
    };
  },

  "DELETE /projects/:id": async (_event, id) => {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          PK: `PROJ#${id}`,
          SK: "DETAILS",
        },
      })
    );
    return { statusCode: 200, message: "Deleted project" };
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
