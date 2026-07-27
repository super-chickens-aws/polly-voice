import {
    DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
    region: "ap-southeast-1"
});

const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "SpeechHistory";

export async function saveHistory(item) {
    await docClient.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        })
    );
}

export async function getHistory(userId) {
    const result = await docClient.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "userId = :id",
            ExpressionAttributeValues: {
                ":id": userId
            },
            ScanIndexForward: false
        })
    );

    return result.Items || [];
}