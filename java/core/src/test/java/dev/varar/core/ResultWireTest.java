package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The {@code .varar/<oathPath>.json} wire format (ADR 0014). The bytes are the cross-port contract:
 * TypeScript field names, declaration order, 2-space indent, optional members absent rather than
 * null — so a result written by any port reads the same in the language server.
 */
class ResultWireTest {

    private static Result.OathResults results(Result.ExampleResult... examples) {
        return new Result.OathResults(1, "varar/library.md", "fnv1a:1622dfca", List.of(examples));
    }

    @Test
    void aPassingExampleOmitsTheFailureKeyEntirely() {
        String json = JsonWriter.stringifyInOrder(Result.toWire(
                results(new Result.ExampleResult("Maya borrows", Result.Status.PASSED, List.of(3, 4), null))));
        assertEquals("""
                {
                  "version": 1,
                  "oathPath": "varar/library.md",
                  "sourceHash": "fnv1a:1622dfca",
                  "examples": [
                    {
                      "name": "Maya borrows",
                      "status": "passed",
                      "lines": [
                        3,
                        4
                      ]
                    }
                  ]
                }""", json);
    }

    @Test
    void aFailureCarriesItsCellsAndItsAnchorInThatOrder() {
        var failure = new Result.ExampleFailure(
                4,
                "expected 6 but was 50",
                "<runtime stack>",
                List.of(new Result.CellFailure(71, 77, "50")),
                new Result.AnchorRange(71, 77));
        String json = JsonWriter.stringifyInOrder(Result.toWire(
                results(new Result.ExampleResult("Ben borrows", Result.Status.FAILED, List.of(13), failure))));
        assertEquals("""
                {
                  "version": 1,
                  "oathPath": "varar/library.md",
                  "sourceHash": "fnv1a:1622dfca",
                  "examples": [
                    {
                      "name": "Ben borrows",
                      "status": "failed",
                      "lines": [
                        13
                      ],
                      "failure": {
                        "line": 4,
                        "message": "expected 6 but was 50",
                        "stack": "<runtime stack>",
                        "cells": [
                          {
                            "from": 71,
                            "to": 77,
                            "actual": "50"
                          }
                        ],
                        "anchor": {
                          "from": 71,
                          "to": 77
                        }
                      }
                    }
                  ]
                }""", json);
    }

    @Test
    void aFailureWithNeitherCellsNorAnchorOmitsBoth() {
        var failure = new Result.ExampleFailure(9, "boom", "<runtime stack>", null);
        String json = JsonWriter.stringifyInOrder(Result.toWire(
                results(new Result.ExampleResult("Noor borrows", Result.Status.FAILED, List.of(9), failure))));
        assertEquals("""
                {
                  "version": 1,
                  "oathPath": "varar/library.md",
                  "sourceHash": "fnv1a:1622dfca",
                  "examples": [
                    {
                      "name": "Noor borrows",
                      "status": "failed",
                      "lines": [
                        9
                      ],
                      "failure": {
                        "line": 9,
                        "message": "boom",
                        "stack": "<runtime stack>"
                      }
                    }
                  ]
                }""", json);
    }

    @Test
    void keysComeOutInTheOrderTheMapYieldsThem() {
        // Declaration order is the format: the reference implementation writes the payload with
        // JSON.stringify, which never reorders.
        var m = new java.util.LinkedHashMap<String, Object>();
        m.put("b", 2);
        m.put("a", 1);
        assertEquals("{\n  \"b\": 2,\n  \"a\": 1\n}", JsonWriter.stringifyInOrder(m));
    }
}
