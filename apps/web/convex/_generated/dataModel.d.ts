import type { GenericDataModel, GenericDocument } from "convex/server";

/**
 * Generic data model definition for ALIVE Convex tables.
 */
export type DataModel = GenericDataModel;
export type Doc<TableName extends string> = GenericDocument;
export type Id<TableName extends string> = string;
