import { APIGatewayProxyHandler } from "aws-lambda";
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
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "dotenv";
import { createResponse } from "../utils/response.js";
config();

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
type RouteHandler = (event: any, id?: string) => Promise<any>;
const tableName = process.env.TABLE_NAME;

const routeHandlers: Record<string, RouteHandler> = {
  "GET /projects": async () => {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExpressionAttributeValues: { ":pk": "PROJ#" },
        FilterExpression: "begins_with(PK, :pk)",
      })
    );

    const details = (scanResult.Items ?? []).filter(
      (item) => item.SK === "DETAILS"
    );

    return createResponse(200, details);
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
      return createResponse(404, { message: "Project not found" });
    }

    return createResponse(200, getResult.Item);
  },

  "POST /projects": async (event) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
    }

    const body = event.body ? JSON.parse(event.body) : null;

    if (!body.name || !body.start_date) {
      return createResponse(400, {
        message: "Missing required fields: name, start_date",
      });
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

    return createResponse(201, {
      message: "Project created",
      project: newProj,
    });
  },

  "PUT /projects/:id": async (event, id) => {
    if (!event.body) {
      return createResponse(400, { message: "Missing request body" });
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
      return createResponse(404, { message: "Project not found" });
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

    return createResponse(200, { message: "Updated project" });
  },

  "DELETE /projects/:id": async (_event, id) => {
    const assignments = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `PROJ#${id}`,
          ":sk": "EMP#",
        },
      })
    );

    const deletes =
      assignments.Items?.map((item) => ({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK },
        },
      })) || [];

    if (deletes.length > 0) {
      await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName!]: deletes,
          },
        })
      );
    }

    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: {
          PK: `PROJ#${id}`,
          SK: "DETAILS",
        },
      })
    );

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
