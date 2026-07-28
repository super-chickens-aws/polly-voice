import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "../config/dynamodb.js";
import { TABLES } from "../constants/tables.js";

export async function getUser(userId) {
    const result = await db.send(
        new GetCommand({
            TableName: TABLES.USERS,
            Key: { userId }
        })
    );

    return result.Item;
}

export async function createUser(user) {
    await db.send(
        new PutCommand({
            TableName: TABLES.USERS,
            Item: user
        })
    );
}