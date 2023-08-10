#!/usr/bin/env node

// src/cli.ts
import dotenv from "dotenv";

// src/schema.ts
import FormData from "form-data";
import fetch2 from "cross-fetch";
import { promises as fs } from "fs";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
async function fromDatabase(dbPath) {
  const db = await open({
    driver: sqlite3.Database,
    filename: dbPath
  });
  const result = await db.all("SELECT * FROM _collections");
  return result.map((collection) => ({
    ...collection,
    schema: JSON.parse(collection.schema)
  }));
}
async function fromJSON(path) {
  const schemaStr = await fs.readFile(path, { encoding: "utf8" });
  return JSON.parse(schemaStr);
}
async function fromURL(url, email = "", password = "") {
  const formData = new FormData();
  formData.append("identity", email);
  formData.append("password", password);
  let collections = [];
  try {
    const { token } = await fetch2(`${url}/api/admins/auth-with-password`, {
      body: formData,
      method: "post"
    }).then((res) => {
      if (!res.ok)
        throw res;
      return res.json();
    });
    const result = await fetch2(`${url}/api/collections?perPage=200`, {
      headers: {
        Authorization: token
      }
    }).then((res) => {
      if (!res.ok)
        throw res;
      return res.json();
    });
    collections = result.items;
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
  return collections;
}

// src/constants.ts
var EXPORT_COMMENT = `/**
* This file was @generated using pocketbase-typegen
*/`;
var RECORD_TYPE_COMMENT = `// Record types for each collection`;
var RESPONSE_TYPE_COMMENT = `// Response types include system fields and match responses from the PocketBase API`;
var ALL_RECORD_RESPONSE_COMMENT = `// Types containing all Records and Responses, useful for creating typing helper functions`;
var EXPAND_GENERIC_NAME = "expand";
var DATE_STRING_TYPE_NAME = `IsoDateString`;
var RECORD_ID_STRING_NAME = `RecordIdString`;
var HTML_STRING_NAME = `HTMLString`;
var ALIAS_TYPE_DEFINITIONS = `// Alias types for improved usability
export type ${DATE_STRING_TYPE_NAME} = string
export type ${RECORD_ID_STRING_NAME} = string
export type ${HTML_STRING_NAME} = string`;
var BASE_SYSTEM_FIELDS_DEFINITION = `// System fields
export type BaseSystemFields<T = never> = {
	id: ${RECORD_ID_STRING_NAME}
	created: ${DATE_STRING_TYPE_NAME}
	updated: ${DATE_STRING_TYPE_NAME}
	collectionId: string
	collectionName: Collections
	expand?: T
}`;
var AUTH_SYSTEM_FIELDS_DEFINITION = `export type AuthSystemFields<T = never> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>`;

// src/utils.ts
import { promises as fs2 } from "fs";
function toPascalCase(str) {
  if (/^[\p{L}\d]+$/iu.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  return str.replace(
    /([\p{L}\d])([\p{L}\d]*)/giu,
    (g0, g1, g2) => g1.toUpperCase() + g2.toLowerCase()
  ).replace(/[^\p{L}\d]/giu, "");
}
function sanitizeFieldName(name) {
  return !isNaN(parseFloat(name.charAt(0))) ? `"${name}"` : name;
}
async function saveFile(outPath, typeString) {
  await fs2.writeFile(outPath, typeString, "utf8");
  console.log(`Created typescript definitions at ${outPath}`);
}
function getSystemFields(type) {
  switch (type) {
    case "auth":
      return "AuthSystemFields";
    default:
      return "BaseSystemFields";
  }
}
function getOptionEnumName(recordName, fieldName) {
  return `${toPascalCase(recordName)}${toPascalCase(fieldName)}Options`;
}
function getOptionValues(field) {
  const values = field.options.values;
  if (!values)
    return [];
  return values.filter((val, i) => values.indexOf(val) === i);
}

// src/collections.ts
function createCollectionEnum(collectionNames) {
  const collections = collectionNames.map((name) => `	${toPascalCase(name)} = "${name}",`).join("\n");
  const typeString = `export enum Collections {
${collections}
}`;
  return typeString;
}
function createCollectionRecords(collectionNames) {
  const nameRecordMap = collectionNames.map((name) => `	${name}: ${toPascalCase(name)}Record`).join("\n");
  return `export type CollectionRecords = {
${nameRecordMap}
}`;
}
function createCollectionResponses(collectionNames) {
  const nameRecordMap = collectionNames.map((name) => `	${name}: ${toPascalCase(name)}Response`).join("\n");
  return `export type CollectionResponses = {
${nameRecordMap}
}`;
}

// src/generics.ts
function fieldNameToGeneric(name) {
  return `T${name}`;
}
function getGenericArgList(schema) {
  const jsonFields = schema.filter((field) => field.type === "json").map((field) => fieldNameToGeneric(field.name)).sort();
  return jsonFields;
}
function getGenericArgStringForRecord(schema) {
  const argList = getGenericArgList(schema);
  if (argList.length === 0)
    return "";
  return `<${argList.map((name) => `${name}`).join(", ")}>`;
}
function getGenericArgStringWithDefault(schema, opts) {
  const argList = getGenericArgList(schema);
  if (opts.includeExpand) {
    argList.push(fieldNameToGeneric(EXPAND_GENERIC_NAME));
  }
  if (argList.length === 0)
    return "";
  return `<${argList.map((name) => `${name} = unknown`).join(", ")}>`;
}

// src/fields.ts
var pbSchemaTypescriptMap = {
  bool: "boolean",
  date: DATE_STRING_TYPE_NAME,
  editor: HTML_STRING_NAME,
  email: "string",
  text: "string",
  url: "string",
  number: "number",
  file: (fieldSchema) => fieldSchema.options.maxSelect && fieldSchema.options.maxSelect > 1 ? "string[]" : "string",
  json: (fieldSchema) => `null | ${fieldNameToGeneric(fieldSchema.name)}`,
  relation: (fieldSchema) => fieldSchema.options.maxSelect && fieldSchema.options.maxSelect === 1 ? RECORD_ID_STRING_NAME : `${RECORD_ID_STRING_NAME}[]`,
  select: (fieldSchema, collectionName) => {
    const valueType = fieldSchema.options.values ? getOptionEnumName(collectionName, fieldSchema.name) : "string";
    return fieldSchema.options.maxSelect && fieldSchema.options.maxSelect > 1 ? `${valueType}[]` : valueType;
  },
  user: (fieldSchema) => fieldSchema.options.maxSelect && fieldSchema.options.maxSelect > 1 ? `${RECORD_ID_STRING_NAME}[]` : RECORD_ID_STRING_NAME
};
function createTypeField(collectionName, fieldSchema) {
  let typeStringOrFunc;
  if (!(fieldSchema.type in pbSchemaTypescriptMap)) {
    console.log(`WARNING: unknown type "${fieldSchema.type}" found in schema`);
    typeStringOrFunc = "unknown";
  } else {
    typeStringOrFunc = pbSchemaTypescriptMap[fieldSchema.type];
  }
  const typeString = typeof typeStringOrFunc === "function" ? typeStringOrFunc(fieldSchema, collectionName) : typeStringOrFunc;
  const fieldName = sanitizeFieldName(fieldSchema.name);
  const required = fieldSchema.required ? "" : "?";
  return `	${fieldName}${required}: ${typeString}`;
}
function createSelectOptions(recordName, schema) {
  const selectFields = schema.filter((field) => field.type === "select");
  const typestring = selectFields.map(
    (field) => `export enum ${getOptionEnumName(recordName, field.name)} {
${getOptionValues(field).map((val) => `	"${getSelectOptionEnumName(val)}" = "${val}",`).join("\n")}
}
`
  ).join("\n");
  return typestring;
}
function getSelectOptionEnumName(val) {
  if (!isNaN(Number(val))) {
    return `E${val}`;
  } else {
    return val;
  }
}

// src/lib.ts
function generate(results) {
  const collectionNames = [];
  const recordTypes = [];
  const responseTypes = [RESPONSE_TYPE_COMMENT];
  results.sort((a, b) => a.name <= b.name ? -1 : 1).forEach((row) => {
    if (row.name)
      collectionNames.push(row.name);
    if (row.schema) {
      recordTypes.push(createRecordType(row.name, row.schema));
      responseTypes.push(createResponseType(row));
    }
  });
  const sortedCollectionNames = collectionNames;
  const fileParts = [
    EXPORT_COMMENT,
    createCollectionEnum(sortedCollectionNames),
    ALIAS_TYPE_DEFINITIONS,
    BASE_SYSTEM_FIELDS_DEFINITION,
    AUTH_SYSTEM_FIELDS_DEFINITION,
    RECORD_TYPE_COMMENT,
    ...recordTypes,
    responseTypes.join("\n"),
    ALL_RECORD_RESPONSE_COMMENT,
    createCollectionRecords(sortedCollectionNames),
    createCollectionResponses(sortedCollectionNames)
  ];
  return fileParts.join("\n\n");
}
function createRecordType(name, schema) {
  const selectOptionEnums = createSelectOptions(name, schema);
  const typeName = toPascalCase(name);
  const genericArgs = getGenericArgStringWithDefault(schema, {
    includeExpand: false
  });
  const fields = schema.map((fieldSchema) => createTypeField(name, fieldSchema)).join("\n");
  return `${selectOptionEnums}export type ${typeName}Record${genericArgs} = ${fields ? `{
${fields}
}` : "never"}`;
}
function createResponseType(collectionSchemaEntry) {
  const { name, schema, type } = collectionSchemaEntry;
  const pascaleName = toPascalCase(name);
  const genericArgsWithDefaults = getGenericArgStringWithDefault(schema, {
    includeExpand: true
  });
  const genericArgsForRecord = getGenericArgStringForRecord(schema);
  const systemFields = getSystemFields(type);
  const expandArgString = `<T${EXPAND_GENERIC_NAME}>`;
  return `export type ${pascaleName}Response${genericArgsWithDefaults} = Required<${pascaleName}Record${genericArgsForRecord}> & ${systemFields}${expandArgString}`;
}

// src/cli.ts
async function main(options2) {
  let schema;
  if (options2.db) {
    schema = await fromDatabase(options2.db);
  } else if (options2.json) {
    schema = await fromJSON(options2.json);
  } else if (options2.url) {
    schema = await fromURL(options2.url, options2.email, options2.password);
  } else if (options2.env) {
    const path = typeof options2.env === "string" ? options2.env : ".env";
    dotenv.config({ path });
    if (!process.env.PB_TYPEGEN_URL || !process.env.PB_TYPEGEN_EMAIL || !process.env.PB_TYPEGEN_PASSWORD) {
      return console.error(
        "Missing environment variables. Check options: pocketbase-typegen --help"
      );
    }
    schema = await fromURL(
      process.env.PB_TYPEGEN_URL,
      process.env.PB_TYPEGEN_EMAIL,
      process.env.PB_TYPEGEN_PASSWORD
    );
  } else {
    return console.error(
      "Missing schema path. Check options: pocketbase-typegen --help"
    );
  }
  const typeString = generate(schema);
  await saveFile(options2.out, typeString);
  return typeString;
}

// src/index.ts
import { program } from "commander";

// package.json
var version = "1.1.12";

// src/index.ts
program.name("Pocketbase Typegen").version(version).description(
  "CLI to create typescript typings for your pocketbase.io records"
).option("-d, --db <char>", "path to the pocketbase SQLite database").option(
  "-j, --json <char>",
  "path to JSON schema exported from pocketbase admin UI"
).option(
  "-u, --url <char>",
  "URL to your hosted pocketbase instance. When using this options you must also provide email and password options."
).option(
  "-e, --email <char>",
  "email for an admin pocketbase user. Use this with the --url option"
).option(
  "-p, --password <char>",
  "password for an admin pocketbase user. Use this with the --url option"
).option(
  "-o, --out <char>",
  "path to save the typescript output file",
  "pocketbase-types.ts"
).option(
  "-e, --env [path]",
  "flag to use environment variables for configuration. Add PB_TYPEGEN_URL, PB_TYPEGEN_EMAIL, PB_TYPEGEN_PASSWORD to your .env file. Optionally provide a path to your .env file"
).option(
  "-w, --watch",
  "watch for changes in the database and automatically regenerate types, does not work with --json"
).option(
  "-i, --interval <number>",
  "interval in ms to check for changes in watch mode, defaults to 5000"
).option(
  "--hook <char>",
  "URL to a custom hook url to check date of the last change. Use this with the --watch option"
);
program.parse(process.argv);
var options = program.opts();
if (options.watch) {
  if (!options.interval) {
    options.interval = 5e3;
  }
  if (options.hook == "") {
    console.error("Hook url must not be empty when using --watch");
    process.exit(1);
  }
  if (options.json) {
    console.error(
      "Cannot use --watch with --json. Check options: pocketbase-typegen --help"
    );
    process.exit(1);
  }
}
main(options);
if (options.watch) {
  console.log("[pocketbase-typegen] watching for changes...");
  let lastTime = Date.now();
  setInterval(async () => {
    if (!options.hook || options.db) {
      console.log("test");
      main(options);
      return console.log("[pocketbase-typegen] synchronizing changes");
    }
    try {
      const res = await fetch(options.hook, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (res.status !== 200) {
        return console.log(
          "[pocketbase-typegen] error synchronizing changes, skipping"
        );
      }
      const data = await res.json();
      if (data.timestamp > lastTime) {
        lastTime = data.timestamp;
        main(options);
        console.log("[pocketbase-typegen] synchronizing changes");
      }
    } catch (err) {
      console.log("[pocketbase-typegen] error synchronizing changes, skipping");
      console.error(err);
    }
  }, options.interval);
}
