import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import path from "path";

export class MiniServerlessBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, "AppTable", {
      tableName: "EmployeeProjectTable",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const employeeFn = new lambda.Function(this, "EmployeeFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "employees.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/dist")),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const projectFn = new lambda.Function(this, "ProjectFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "projects.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/dist")),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const assignmentFn = new lambda.Function(this, "AssignmentFunction", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "assignments.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src/dist")),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantReadWriteData(employeeFn);
    table.grantReadWriteData(projectFn);
    table.grantReadWriteData(assignmentFn);

    const api = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "MiniProjAPI",
    });

    const employeeIntegration = new HttpLambdaIntegration(
      "EmployeeIntegration",
      employeeFn
    );

    const projectIntegration = new HttpLambdaIntegration(
      "ProjectIntegraton",
      projectFn
    );

    const assignmentIntegration = new HttpLambdaIntegration(
      "AssignmentIntegration",
      assignmentFn
    );

    api.addRoutes({
      path: "/employees",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: employeeIntegration,
    });

    api.addRoutes({
      path: "/employees/{id}",
      methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
      integration: employeeIntegration,
    });

    api.addRoutes({
      path: "/projects",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: projectIntegration,
    });

    api.addRoutes({
      path: "/projects/{id}",
      methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
      integration: projectIntegration,
    });

    api.addRoutes({
      path: "/assignments",
      methods: [HttpMethod.POST, HttpMethod.DELETE],
      integration: assignmentIntegration,
    });

    api.addRoutes({
      path: "/employees/{id}/projects",
      methods: [HttpMethod.GET],
      integration: assignmentIntegration,
    });

    api.addRoutes({
      path: "/projects/{id}/employees",
      methods: [HttpMethod.GET],
      integration: assignmentIntegration,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.apiEndpoint,
      description: "The base URL of the HTTP API",
    });
  }
}
