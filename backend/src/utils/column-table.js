/**
 * Minimal column store for parsed datasets. Replaces danfojs-node, which pulled
 * TensorFlow and an off-registry xlsx tarball that npm refuses to install.
 * Exposes the one API the analytics code uses: table.column(name).values.
 */
class ColumnTable {
  constructor(rows, { columns }) {
    this.columns = columns;
    this._data = new Map(columns.map((name, i) => [name, rows.map((row) => row[i])]));
  }

  column(name) {
    const values = this._data.get(name);
    if (!values) throw new Error(`Column "${name}" does not exist`);
    return { values };
  }
}

module.exports = { ColumnTable };
