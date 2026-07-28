import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "../config/dynamodb.js";
import { TABLES } from "../constants/tables.js";

export async function saveHistory(item) {
    await db.send(
        new PutCommand({
            TableName: TABLES.HISTORY,
            Item: item
        })
    );
}

export async function getHistory(userId) {
    const result = await db.send(
        new QueryCommand({
            TableName: TABLES.HISTORY,
            KeyConditionExpression: "userId = :id",
            ExpressionAttributeValues: {
                ":id": userId
            },
            ScanIndexForward: false
        })
    );

    return result.Items ?? [];
}