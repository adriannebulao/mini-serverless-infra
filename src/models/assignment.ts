import { Entity, item, string } from "dynamodb-toolbox";
import { AppTable } from "./table";

export const AssignmentEntity = new Entity({
  name: "Assignment",
  table: AppTable,
  computeKey: ({ employeeId, projectId }) => ({
    PK: `EMP#${employeeId}`,
    SK: `PROJ#${projectId}`,
  }),
  schema: item({
    employeeId: string().key(),
    projectId: string().key(),
    GSI1PK: string().required(),
    GSI1SK: string().required(),
    role: string().optional(),
    assigned_at: string().required(),
  }),
  timestamps: {
    created: { name: "created_at" },
    modified: { name: "updated_at" },
  },
});
