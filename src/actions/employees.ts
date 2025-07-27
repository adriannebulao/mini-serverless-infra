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
  "GET /employees": async () => {
    const scanResult = await client.send(
      new ScanCommand({
        TableName: tableName,
        ExpressionAttributeValues: { ":pk": "EMP#" },
        FilterExpression: "begins_with(PK, :pk)",
      })
    );

    const profiles = (scanResult.Items ?? []).filter(
      (item) => item.SK === "PROFILE"
    );

    return createResponse(200, profiles);
  },

  "GET /employees/:id": async (_event, id) => {
    const getResult = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `EMP#${id}`,
          SK: "PROFILE",
        },
      })
    );

    if (!getResult.Item) {
      return createResponse(
        404,
        JSON.stringify({ message: "Employee not found" })
      );
    }

    return createResponse(200, JSON.stringify(getResult.Item));
  },

  "POST /employees": async (event) => {
    if (!event.body) {
      return createResponse(
        400,
        JSON.stringify({ message: "Missing request body" })
      );
    }

    const body = event.body ? JSON.parse(event.body) : null;

    if (!body.name || !body.email || !body.start_date) {
      return createResponse(
        400,
        JSON.stringify({
          message: "Missing required fields: name, email, start_date",
        })
      );
    }
    const timestamp = new Date().toISOString();
    const empId = uuidv4();

    const newEmp = {
      PK: `EMP#${empId}`,
      SK: "PROFILE",
      name: body.name,
      email: body.email,
      start_date: body.start_date,
      end_date: body.end_date ?? null,
      positions: body.positions || [],
      tech_stack: body.tech_stack || [],
      created_at: timestamp,
      updated_at: timestamp,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: newEmp,
      })
    );

    return createResponse(
      201,
      JSON.stringify({ message: "Employee created", employee: newEmp })
    );
  },

  "PUT /employees/:id": async (event, id) => {
    if (!event.body) {
      return createResponse(
        400,
        JSON.stringify({ message: "Missing request body" })
      );
    }

    const body = event.body ? JSON.parse(event.body) : null;
    const timestamp = new Date().toISOString();
    const key = { PK: `EMP#${id}`, SK: "PROFILE" };

    const existing = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      })
    );

    if (!existing.Item) {
      return createResponse(
        404,
        JSON.stringify({ message: "Employee not found" })
      );
    }

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: `
        SET #name = :name,
            email = :email,
            start_date = :start_date,
            end_date = :end_date,
            positions = :positions,
            tech_stack = :tech_stack,
            updated_at = :updated_at
      `,
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ExpressionAttributeValues: {
          ":name": body.name,
          ":email": body.email,
          ":start_date": body.start_date,
          ":end_date": body.end_date,
          ":positions": body.positions,
          ":tech_stack": body.tech_stack,
          ":updated_at": timestamp,
        },
      })
    );

    return createResponse(200, JSON.stringify({ message: "Updated employee" }));
  },

  "DELETE /employees/:id": async (_event, id) => {
    const assignments = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `EMP#${id}`,
          ":sk": "PROJ#",
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
          PK: `EMP#${id}`,
          SK: "PROFILE",
        },
      })
    );

    return createResponse(
      200,
      JSON.stringify({ message: "Deleted employee and related assignments" })
    );
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
