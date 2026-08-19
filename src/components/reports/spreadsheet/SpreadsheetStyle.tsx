export function SpreadsheetStyle() {
  return (
    <style dangerouslySetInnerHTML={{__html: `
      :root {
        --report-heading-blue: #a9c4ec;
        --report-column-blue: #a9c4ec;
        --report-total-blue: #9fbde9;
        --report-light-yellow: #ffe599;
        --report-strong-yellow: #f6bf26;
        --report-body-gray: #f3f3f3;
        --report-grid: #202020;
        --report-red: #ff0000;
        --report-blue-text: #0000ff;
        --report-white: #ffffff;
      }

      .report-nav {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      
      .report-nav button {
        padding: 8px 16px;
        background: #e2e8f0;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
      }

      .report-nav button.active {
        background: #1d4ed8;
        color: white;
        border-color: #1e3a8a;
      }

      .report-nav button.print-btn {
        background: #10b981;
        color: white;
        border-color: #059669;
        margin-left: auto;
      }

      .report-table-container {
        overflow-x: auto;
        margin-bottom: 40px;
        background: white;
        padding-bottom: 10px;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 13px;
        color: black;
        font-family: Arial, sans-serif;
      }

      .report-table th, .report-table td {
        border: 1px solid var(--report-grid);
        padding: 4px 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .report-table td {
        white-space: normal;
      }

      .label-col {
        width: 350px;
        text-align: left;
        font-weight: bold;
      }

      .year-col {
        width: 140px;
        text-align: center;
        font-weight: bold;
      }

      .header-row th {
        background: var(--report-heading-blue);
      }

      .center-text { text-align: center; }
      .right-text { text-align: right; }
      .bold-text { font-weight: bold; }
      .red-text { color: var(--report-red); }
      .blue-text { color: var(--report-blue-text); }

      .orange-row td { background: var(--report-strong-yellow); }
      .yellow-row td { background: var(--report-light-yellow); }
      .light-yellow-row td { background: var(--report-light-yellow); }
      .total-row td { background: var(--report-total-blue); }

      .print-header {
        display: none;
      }

      @media print {
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        body * {
          visibility: hidden;
        }

        .report-wrapper, .report-wrapper * {
          visibility: visible;
        }

        .report-wrapper {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }

        .report-nav {
          display: none;
        }

        .print-section {
          page-break-before: always;
        }
        .print-section:first-child {
          page-break-before: auto;
        }

        .print-header {
          display: block;
          margin-bottom: 20px;
        }

        .print-header h2 {
          font-size: 16px;
          margin: 0 0 5px 0;
          color: black;
        }

        .print-meta {
          font-size: 12px;
          color: #444;
        }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        thead {
          display: table-header-group;
        }

        tr {
          break-inside: avoid;
        }
      }
    `}} />
  )
}
