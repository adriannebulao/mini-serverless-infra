import { APIGatewayProxyHandler } from "aws-lambda";
import { StatusCodes } from "http-status-codes";
import { config } from "dotenv";
import { createResponse } from "../utils/response.js";
import { AssignmentEntity } from "../models/assignment.js";
import { EmployeeEntity } from "../models/employee.js";
import { ProjectEntity } from "../models/project.js";
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "dynamodb-toolbox";
import { AppTable } from "../models/table.js";
config();

type RouteHandler = (event: any, id?: string) => Promise<any>;

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

    const { Item: employee } = await EmployeeEntity.build(GetItemCommand)
      .key({ id: employeeId })
      .send();

    if (!employee) {
      return createResponse(404, {
        message: `Employee ${employeeId} not found`,
      });
    }

    const { Item: project } = await ProjectEntity.build(GetItemCommand)
      .key({ id: projectId })
      .send();

    if (!project) {
      return createResponse(404, { message: `Project ${projectId} not found` });
    }

    const newAssignment = {
      employeeId,
      projectId,
      GSI1PK: `PROJ#${projectId}`,
      GSI1SK: `EMP#${employeeId}`,
      role,
      assigned_at: new Date().toISOString(),
    };

    await AssignmentEntity.build(PutItemCommand).item(newAssignment).send();

    return createResponse(201, {
      message: "Employee assigned to project",
    });
  },

  "GET /employees/:id/projects": async (_event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing employee id" });
    }

    const { Items: assignments } = await AppTable.build(QueryCommand)
      .entities(AssignmentEntity)
      .query({
        partition: `EMP#${id}`,
        range: { attr: "SK", beginsWith: "PROJ#" },
      })
      .send();

    if (!assignments || assignments.length === 0) {
      return createResponse(200, []);
    }

    const projectPromises = assignments.map((assignment) =>
      ProjectEntity.build(GetItemCommand)
        .key({ id: assignment.projectId })
        .send()
    );

    const projectResults = await Promise.all(projectPromises);
    const projects = projectResults
      .map((result) => result.Item)
      .filter(Boolean);

    const projectNames = new Map();
    projects.forEach((project) => {
      if (project) {
        projectNames.set(project.id, project.name);
      }
    });

    const enrichedAssignments = assignments.map((assignment) => ({
      ...assignment,
      projectName: projectNames.get(assignment.projectId) || "Unknown Project",
    }));

    return createResponse(200, enrichedAssignments);
  },

  "GET /projects/:id/employees": async (_event, id) => {
    if (!id) {
      return createResponse(400, { message: "Missing project id" });
    }

    const { Items: assignments } = await AppTable.build(QueryCommand)
      .entities(AssignmentEntity)
      .query({
        partition: `PROJ#${id}`,
        range: { attr: "GSI1SK", beginsWith: "EMP#" },
        index: "GSI1",
      })
      .send();

    if (!assignments || assignments.length === 0) {
      return createResponse(200, []);
    }

    const employeePromises = assignments.map((assignment) =>
      EmployeeEntity.build(GetItemCommand)
        .key({ id: assignment.employeeId })
        .send()
    );

    const employeeResults = await Promise.all(employeePromises);
    const employees = employeeResults
      .map((result) => result.Item)
      .filter(Boolean);

    const employeeNames = new Map();
    employees.forEach((employee) => {
      if (employee) {
        employeeNames.set(employee.id, employee.name);
      }
    });

    const enrichedAssignments = assignments.map((assignment) => ({
      ...assignment,
      employeeName:
        employeeNames.get(assignment.employeeId) || "Unknown Employee",
    }));

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

    await AssignmentEntity.build(DeleteItemCommand)
      .key({ employeeId, projectId })
      .send();

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
