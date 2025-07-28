import { Entity, item, list, string } from "dynamodb-toolbox";
import { AppTable } from "./table";

export const EmployeeEntity = new Entity({
  name: "Employee",
  table: AppTable,
  computeKey: (id) => ({
    PK: `EMP#${id}`,
    SK: "PROFILE",
  }),
  schema: item({
    id: string().key(),
    GSI1PK: string().required(),
    GSI1SK: string().required(),
    name: string().required(),
    email: string().required(),
    start_date: string().required(),
    end_date: string().optional(),
    positions: list(string()).default([]),
    tech_stack: list(string()).default([]),
  }),
  timestamps: {
    created: { name: "created_at" },
    modified: { name: "updated_at" },
  },
});
