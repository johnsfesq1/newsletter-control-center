#!/bin/bash

echo "--- ncc_production ---"
bq ls --format=json ncc_production | jq -r '.[].tableReference.tableId' | while read table; do
  echo "Table: $table"
  bq show --format=json ncc_production.$table | jq '{id: .tableReference.tableId, numRows: .numRows, schema: .schema.fields}'
done

echo "--- ncc_newsletters ---"
bq ls --format=json ncc_newsletters | jq -r '.[].tableReference.tableId' | while read table; do
  echo "Table: $table"
  bq show --format=json ncc_newsletters.$table | jq '{id: .tableReference.tableId, numRows: .numRows, schema: .schema.fields}'
done

