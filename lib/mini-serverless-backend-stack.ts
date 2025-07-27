import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import path from "path";
import { config } from "dotenv";
import * as s3 from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
config();

export class MiniServerlessBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tableName = process.env.TABLE_NAME;
    if (!tableName) {
      throw new Error("TABLE_NAME environment variable is not defined.");
    }

    const table = new dynamodb.Table(this, "AppTable", {
      tableName: tableName,
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

    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) {
      throw new Error("FRONTEND_URL environment variable is not defined.");
    }

    const api = new apigateway.RestApi(this, "MiniProjRestApi", {
      restApiName: "MiniProjAPI",
      defaultCorsPreflightOptions: {
        allowOrigins: [frontendUrl],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: cdk.Duration.days(10),
        statusCode: 200,
      },
    });

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const frontendBuildPath = process.env.FRONTEND_BUILD_PATH;
    if (!frontendBuildPath) {
      throw new Error(
        "FRONTEND_BUILD_PATH environment variable is not defined."
      );
    }
    new BucketDeployment(this, "FrontendDeployment", {
      sources: [Source.asset(frontendBuildPath)],
      destinationBucket: frontendBucket,
    });

    new cdk.CfnOutput(this, "FrontendURL", {
      value: frontendBucket.bucketWebsiteUrl,
    });

    const employeeIntegration = new apigateway.LambdaIntegration(employeeFn);
    const projectIntegration = new apigateway.LambdaIntegration(projectFn);
    const assignmentIntegration = new apigateway.LambdaIntegration(
      assignmentFn
    );

    const employees = api.root.addResource("employees");
    employees.addMethod("GET", employeeIntegration);
    employees.addMethod("POST", employeeIntegration);

    const employeeById = employees.addResource("{id}");
    employeeById.addMethod("GET", employeeIntegration);
    employeeById.addMethod("PUT", employeeIntegration);
    employeeById.addMethod("DELETE", employeeIntegration);

    const projects = api.root.addResource("projects");
    projects.addMethod("GET", projectIntegration);
    projects.addMethod("POST", employeeIntegration);

    const projectById = projects.addResource("{id}");
    projectById.addMethod("GET", projectIntegration);
    projectById.addMethod("PUT", projectIntegration);
    projectById.addMethod("DELETE", projectIntegration);

    const assignments = api.root.addResource("assignments");
    assignments.addMethod("POST", assignmentIntegration);
    assignments.addMethod("DELETE", assignmentIntegration);

    const employeeProjects = employeeById.addResource("projects");
    employeeProjects.addMethod("GET", assignmentIntegration);

    const projectEmployees = projectById.addResource("employees");
    projectEmployees.addMethod("GET", assignmentIntegration);

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "The base URL of the HTTP API",
    });
  }
}
