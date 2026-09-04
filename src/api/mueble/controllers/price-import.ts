import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { factories } from "@strapi/strapi";

const PRICE_FIELDS = [
  "precio_lista_chiapas",
  "precio_oferta_chiapas",
  "precio_lista_tapachula",
  "precio_oferta_tapachula",
  "precio_lista_tabasco",
  "precio_oferta_tabasco",
] as const;

type PriceField = (typeof PRICE_FIELDS)[number];
type PriceData = Partial<Record<PriceField, number>>;
type ParsedRow = {
  name: string;
  productCode?: string;
  prices: PriceData;
  rowNumber: number;
};

type ImportReport = {
  sheet: string;
  rowsRead: number;
  updated: number;
  notFound: Array<{ row: number; name: string; codigo_producto?: string }>;
  invalid: Array<{ row: number; reason: string }>;
  duplicated: Array<{ row: number; name: string; matches: number }>;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.findIndex((row) =>
    row.some((cell) => normalize(cell) === "nombre"),
  );
}

function findNameColumn(header: unknown[]): number {
  return header.findIndex((cell) => normalize(cell) === "nombre");
}

function inferField(
  rows: unknown[][],
  headerRow: number,
  column: number,
): PriceField | null {
  const regionByName: Record<string, string> = {
    chiapas: "chiapas",
    tapachula: "tapachula",
    tabasco: "tabasco",
  };
  const region = regionByName[normalize(rows[headerRow]?.[column])];
  if (!region) return null;

  for (let row = headerRow - 1; row >= Math.max(0, headerRow - 3); row -= 1) {
    let section = "";
    for (let currentColumn = column; currentColumn >= 0; currentColumn -= 1) {
      const candidate = normalize(rows[row]?.[currentColumn]);
      if (candidate) {
        section = candidate;
        break;
      }
    }

    if (section.includes("2025")) return null;
    if (section.includes("oferta") && section.includes("2026")) {
      return `precio_oferta_${region}` as PriceField;
    }
    if (section.includes("precio") && section.includes("2026")) {
      return `precio_lista_${region}` as PriceField;
    }
  }

  return null;
}

function parseSheet(rows: unknown[][], sheetName: string): ParsedRow[] {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return [];

  const header = rows[headerRow] || [];
  const nameColumn = findNameColumn(header);
  const codeColumn = header.findIndex((cell) =>
    ["codigo", "codigo producto", "codigo_producto", "sku"].includes(
      normalize(cell),
    ),
  );
  const fieldsByColumn = new Map<number, PriceField>();

  header.forEach((_cell, column) => {
    const field = inferField(rows, headerRow, column);
    if (field) fieldsByColumn.set(column, field);
  });

  const parsed: ParsedRow[] = [];
  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const name = String(row[nameColumn] ?? "").trim();
    if (!name || !normalize(name) || normalize(name).includes("total"))
      continue;

    const prices: PriceData = {};
    fieldsByColumn.forEach((field, column) => {
      const value = parseNumber(row[column]);
      if (value !== null) prices[field] = value;
    });

    if (Object.keys(prices).length === 0) continue;
    parsed.push({
      name,
      productCode:
        codeColumn >= 0
          ? String(row[codeColumn] ?? "").trim() || undefined
          : undefined,
      prices,
      rowNumber: index + 1,
    });
  }

  return parsed;
}

function getUploadedFile(
  ctx: any,
): { filepath: string; originalFilename?: string } | null {
  const files = ctx.request.files || {};
  const file = files.archivo || files.file || Object.values(files)[0];
  if (!file || typeof file !== "object") return null;
  const filepath = file.filepath || file.path;
  return filepath
    ? { filepath, originalFilename: file.originalFilename || file.name }
    : null;
}

function isAuthorized(ctx: any): boolean {
  const expected = process.env.PRICE_IMPORT_TOKEN;
  if (!expected) return false;
  const received = String(
    ctx.request.headers["x-price-import-token"] || "",
  ).trim();
  return received.length > 0 && received === expected;
}

export async function importPrices(ctx: any, strapi: any) {
  if (!isAuthorized(ctx))
    return ctx.unauthorized("Token de importación inválido.");

  const uploaded = getUploadedFile(ctx);
  if (!uploaded)
    return ctx.badRequest('Adjunta el archivo Excel en el campo "archivo".');

  const extension = path
    .extname(uploaded.originalFilename || uploaded.filepath)
    .toLowerCase();
  if (![".xlsx", ".xls", ".csv"].includes(extension)) {
    return ctx.badRequest("El archivo debe ser XLSX, XLS o CSV.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(uploaded.filepath, { cellDates: false });
  } catch {
    return ctx.badRequest("No se pudo leer el archivo de precios.");
  } finally {
    if (fs.existsSync(uploaded.filepath)) fs.unlinkSync(uploaded.filepath);
  }

  const sheetName =
    workbook.SheetNames.find((name) => normalize(name).includes("lista")) ||
    workbook.SheetNames[0];
  if (!sheetName) return ctx.badRequest("El libro no contiene hojas.");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
  }) as unknown[][];
  const parsedRows = parseSheet(rows, sheetName);
  const report: ImportReport = {
    sheet: sheetName,
    rowsRead: parsedRows.length,
    updated: 0,
    notFound: [],
    invalid: [],
    duplicated: [],
  };

  const products = await strapi.db.query("api::mueble.mueble").findMany({
    select: ["id", "nombre", "codigo_producto"],
  });
  const byCode = new Map<string, any[]>();
  const byName = new Map<string, any[]>();
  products.forEach((product: any) => {
    const code = normalize(product.codigo_producto);
    const name = normalize(product.nombre);
    if (code) byCode.set(code, [...(byCode.get(code) || []), product]);
    if (name) byName.set(name, [...(byName.get(name) || []), product]);
  });

  for (const row of parsedRows) {
    const matches = row.productCode
      ? byCode.get(normalize(row.productCode)) || []
      : byName.get(normalize(row.name)) || [];
    if (matches.length === 0) {
      report.notFound.push({
        row: row.rowNumber,
        name: row.name,
        codigo_producto: row.productCode,
      });
      continue;
    }
    if (matches.length > 1) {
      report.duplicated.push({
        row: row.rowNumber,
        name: row.name,
        matches: matches.length,
      });
      continue;
    }

    const values = Object.fromEntries(
      Object.entries(row.prices).filter(
        ([field, value]) =>
          PRICE_FIELDS.includes(field as PriceField) && Number.isFinite(value),
      ),
    );
    if (Object.keys(values).length === 0) {
      report.invalid.push({
        row: row.rowNumber,
        reason: "No contiene precios válidos.",
      });
      continue;
    }

    await strapi.db
      .query("api::mueble.mueble")
      .update({ where: { id: matches[0].id }, data: values });
    report.updated += 1;
  }

  return ctx.send(report);
}
