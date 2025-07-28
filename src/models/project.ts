import { Entity, item, list, string } from "dynamodb-toolbox";
import { AppTable } from "./table.js";

export const ProjectEntity = new Entity({
  name: "Project",
  table: AppTable,
  computeKey: ({ id }) => ({
    PK: `PROJ#${id}`,
    SK: "DETAILS",
  }),
  schema: item({
    id: string().key(),
    GSI1PK: string().required(),
    GSI1SK: string().required(),
    name: string().required(),
    description: string().optional(),
    start_date: string().required(),
    end_date: string().optional(),
    tech_stack: list(string()).default([]),
  }),
  timestamps: {
    created: { name: "created_at" },
    modified: { name: "updated_at" },
  },
});
