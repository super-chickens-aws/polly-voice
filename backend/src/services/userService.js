import {
    GetCommand,
    PutCommand
} from "@aws-sdk/lib-dynamodb";

import { db } from "./dynamodb.js";

const TABLE_NAME = "Users";

export async function getUser(userId) {
    const result = await db.send(
        new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                userId
            }
        })
    );

    return result.Item;
}

export async function createUser(user) {
    await db.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: user
        })
    );
}