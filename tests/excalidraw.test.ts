import { describe, expect, test } from "bun:test";
import {
  adjustedRoughness,
  arrowheadPoints,
  cornerRadius,
  dashArray,
  ExcalidrawParseError,
  parseExcalidrawScene,
  sceneBounds,
  type ExcalidrawElement,
} from "../src/excalidraw.ts";

function scene(elements: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ elements, type: "excalidraw", version: 2, ...extra });
}

const RECTANGLE = {
  backgroundColor: "#a5d8ff",
  height: 80,
  id: "rect-1",
  seed: 42,
  strokeColor: "#1e1e1e",
  type: "rectangle",
  width: 200,
  x: 100,
  y: 50,
};

describe("parseExcalidrawScene", () => {
  test("reads elements and the view background", () => {
    const parsed = parseExcalidrawScene(scene([RECTANGLE], { appState: { viewBackgroundColor: "#f8f9fa" } }));
    expect(parsed.backgroundColor).toBe("#f8f9fa");
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.elements[0]?.type).toBe("rectangle");
    expect(parsed.elements[0]?.width).toBe(200);
  });

  test("applies Excalidraw defaults to absent fields", () => {
    const element = parseExcalidrawScene(scene([RECTANGLE])).elements[0] as ExcalidrawElement;
    expect(element.opacity).toBe(100);
    expect(element.roughness).toBe(1);
    expect(element.strokeStyle).toBe("solid");
    expect(element.lineHeight).toBe(1.25);
    expect(element.angle).toBe(0);
  });

  test("drops deleted elements", () => {
    const parsed = parseExcalidrawScene(scene([RECTANGLE, { ...RECTANGLE, id: "rect-2", isDeleted: true }]));
    expect(parsed.elements.map((element) => element.id)).toEqual(["rect-1"]);
  });

  test("gives arrows a default end arrowhead but lines none", () => {
    const parsed = parseExcalidrawScene(
      scene([
        { ...RECTANGLE, id: "a", type: "arrow" },
        { ...RECTANGLE, id: "l", type: "line" },
      ]),
    );
    expect(parsed.elements[0]?.endArrowhead).toBe("arrow");
    expect(parsed.elements[1]?.endArrowhead).toBeNull();
  });

  test("keeps only data: image payloads", () => {
    const parsed = parseExcalidrawScene(
      scene([RECTANGLE], {
        files: {
          local: { dataURL: "data:image/png;base64,AAAA" },
          remote: { dataURL: "https://example.com/tracker.png" },
          script: { dataURL: "javascript:alert(1)" },
        },
      }),
    );
    expect([...parsed.files.keys()]).toEqual(["local"]);
  });

  test("rejects malformed input with a readable message", () => {
    expect(() => parseExcalidrawScene("{ not json")).toThrow(ExcalidrawParseError);
    expect(() => parseExcalidrawScene('{"type":"excalidraw"}')).toThrow('Scene has no "elements" array');
    expect(() => parseExcalidrawScene(scene([]))).toThrow("no drawable elements");
    expect(() => parseExcalidrawScene(scene([{ type: "rectangle", isDeleted: true }]))).toThrow("no drawable elements");
  });

  test("rejects a scene above the element limit", () => {
    const elements = Array.from({ length: 5001 }, (_, index) => ({ ...RECTANGLE, id: `rect-${index}` }));
    expect(() => parseExcalidrawScene(scene(elements))).toThrow("above the 5000 limit");
  });
});

describe("sceneBounds", () => {
  test("wraps every element with padding", () => {
    const bounds = sceneBounds([...parseExcalidrawScene(scene([RECTANGLE])).elements]);
    expect(bounds).toEqual({ x: 88, y: 38, width: 224, height: 104 });
  });

  test("reserves the swept diagonal for a rotated element", () => {
    const rotated = parseExcalidrawScene(scene([{ ...RECTANGLE, angle: Math.PI / 4 }])).elements;
    const bounds = sceneBounds([...rotated]);
    expect(bounds.width).toBeGreaterThan(224);
    expect(bounds.height).toBeGreaterThan(104);
  });
});

describe("cornerRadius", () => {
  test("scales proportionally below the cutoff", () => {
    expect(cornerRadius(80, { type: 3 })).toBe(20);
  });

  test("caps at the adaptive radius above the cutoff", () => {
    expect(cornerRadius(400, { type: 3 })).toBe(32);
  });

  test("is always proportional for legacy proportional roundness", () => {
    expect(cornerRadius(400, { type: 2 })).toBe(100);
  });
});

describe("adjustedRoughness", () => {
  const element = (width: number, height: number): ExcalidrawElement =>
    parseExcalidrawScene(scene([{ ...RECTANGLE, height, roughness: 2, width }])).elements[0] as ExcalidrawElement;

  test("leaves roughness alone on a comfortably sized shape", () => {
    expect(adjustedRoughness(element(200, 80))).toBe(2);
  });

  test("damps roughness on a tiny shape", () => {
    expect(adjustedRoughness(element(8, 8))).toBeCloseTo(2 / 3);
  });
});

describe("dashArray", () => {
  const element = (strokeStyle: string, strokeWidth: number): ExcalidrawElement =>
    parseExcalidrawScene(scene([{ ...RECTANGLE, strokeStyle, strokeWidth }])).elements[0] as ExcalidrawElement;

  test("matches Excalidraw's dash and dot patterns", () => {
    expect(dashArray(element("dashed", 2))).toEqual([8, 10]);
    expect(dashArray(element("dotted", 2))).toEqual([1.5, 8]);
    expect(dashArray(element("solid", 2))).toBeUndefined();
  });
});

describe("arrowheadPoints", () => {
  test("puts the tip between two symmetric wings", () => {
    const [left, tip, right] = arrowheadPoints([100, 0], [0, 0], "arrow", 20);
    expect(tip).toEqual([100, 0]);
    expect(left?.[0]).toBeCloseTo(right?.[0] ?? 0);
    expect(left?.[1]).toBeCloseTo(-(right?.[1] ?? 0));
  });

  test("draws a bar as a segment across the direction of travel", () => {
    const points = arrowheadPoints([100, 0], [0, 0], "bar", 20);
    expect(points).toHaveLength(2);
    expect(points[0]?.[0]).toBeCloseTo(100);
    expect(points[1]?.[0]).toBeCloseTo(100);
    expect(points[0]?.[1]).toBeCloseTo(10);
    expect(points[1]?.[1]).toBeCloseTo(-10);
  });
});
