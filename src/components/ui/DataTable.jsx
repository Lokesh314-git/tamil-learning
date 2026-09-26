import React from 'react';

const DataTable = ({ columns = [], rows = [], emptyText = 'No data found.' }) => (
  <div className="table-scroll">
    <table className="table modern-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={row.id || rowIndex}>
            {columns.map((col) => (
              <td key={col.key}>{typeof col.render === 'function' ? col.render(row) : row[col.key]}</td>
            ))}
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={columns.length}>{emptyText}</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

export default DataTable;
