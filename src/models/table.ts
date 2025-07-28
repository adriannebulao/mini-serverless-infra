import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Table } from "dynamodb-toolbox";
import { config } from "dotenv";
config();

const tableName = process.env.TABLE_NAME;

if (!tableName) {
  throw new Error("TABLE_NAME variable is not defined.");
}

const dynamoDbClient = new DynamoDBClient();
const documentClient = DynamoDBDocumentClient.from(dynamoDbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const AppTable = new Table({
  name: tableName,
  partitionKey: {
    name: "PK",
    type: "string",
  },
  sortKey: {
    name: "SK",
    type: "string",
  },
  indexes: {
    GSI1: {
      type: "global",
      partitionKey: { name: "GSI1PK", type: "string" },
      sortKey: { name: "GSI1SK", type: "string" },
    },
  },
  documentClient,
});
