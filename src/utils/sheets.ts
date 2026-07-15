interface SalesMember {
  id: string;
  name: string;
  avatar?: string;
  color?: string;
}

interface WorkLog {
  id: string;
  salesId: string;
  date: string;
  type: string; // 'work' | 'case' | 'call'
  startTime: string;
  endTime: string;
  details: string;
  callsCount?: number;
  status?: string;
  callResult?: string;
}

/**
 * Creates a Google Spreadsheet and populates it with sales and work logs.
 * @returns The URL of the created spreadsheet.
 */
export async function createAndPopulateSpreadsheet(
  accessToken: string,
  sales: SalesMember[],
  logs: WorkLog[]
): Promise<string> {
  // 1. Create the spreadsheet with two sheets
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: `รายงานบันทึกงานประจำวัน (Sales Worklog) - ${new Date().toLocaleDateString('th-TH')}`
      },
      sheets: [
        {
          properties: {
            title: 'บันทึกงาน',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        },
        {
          properties: {
            title: 'รายชื่อทีมขาย',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Failed to create spreadsheet: ${errText}`);
  }

  const spreadsheet = await createResponse.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl;

  // 2. Format Work Logs Data
  const workLogsHeader = [
    'วันที่',
    'ชื่อพนักงานขาย',
    'ประเภทงาน',
    'เวลาเริ่มต้น',
    'เวลาสิ้นสุด',
    'รายละเอียดงาน',
    'จำนวนสายที่โทร',
    'ผลการติดต่อ',
    'สถานะเคส/งาน'
  ];

  // Helper to map type to Thai label
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'work': return 'Work plan';
      case 'case': return 'Unplan';
      case 'call': return 'โทรหาลูกค้า';
      default: return type;
    }
  };

  // Helper to map callResult to Thai label
  const getCallResultLabel = (result: string | undefined) => {
    switch (result) {
      case 'unreachable': return 'ติดต่อไม่ได้';
      case 'connected':
      case 'answered': // Keep for backward-compatibility if old logs had it
        return 'ติดต่อได้';
      default: return 'ติดต่อได้'; // Default fallback
    }
  };

  // Helper to map status to Thai label
  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case 'completed': return 'สำเร็จ';
      case 'inprogress': return 'กำลังทำ';
      case 'pending': return 'รอดำเนินการ';
      case 'notstarted': return 'ยังไม่ดำเนินการ';
      default: return status || '-';
    }
  };

  const salesMap = new Map(sales.map(s => [s.id, s.name]));

  // Sort logs by date descending, then start time
  const sortedLogs = [...logs].sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return a.startTime.localeCompare(b.startTime);
  });

  const workLogsRows = sortedLogs.map(log => [
    log.date,
    salesMap.get(log.salesId) || log.salesId,
    getTypeLabel(log.type),
    log.startTime,
    log.endTime,
    log.details,
    log.type === 'call' ? (log.callsCount || 0) : '-',
    log.type === 'call' ? getCallResultLabel(log.callResult) : '-',
    getStatusLabel(log.status)
  ]);

  // 3. Format Sales Members Data
  const salesHeader = ['รหัสพนักงาน', 'ชื่อเซลล์', 'สีกำหนด'];
  const salesRows = sales.map(s => [
    s.id,
    s.name,
    s.color || ''
  ]);

  // 4. Update both sheets in a single batchUpdate request for efficiency
  const updateResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'บันทึกงาน!A1',
          values: [workLogsHeader, ...workLogsRows]
        },
        {
          range: 'รายชื่อทีมขาย!A1',
          values: [salesHeader, ...salesRows]
        }
      ]
    })
  });

  if (!updateResponse.ok) {
    const errText = await updateResponse.text();
    throw new Error(`Failed to populate spreadsheet: ${errText}`);
  }

  // 5. Apply bold formatting to the headers
  const formatResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        // Bold the first row (headers) in "บันทึกงาน"
        {
          repeatCell: {
            range: {
              sheetId: spreadsheet.sheets[0].properties.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: workLogsHeader.length
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                },
                backgroundColor: {
                  red: 0.9,
                  green: 0.9,
                  blue: 0.9
                }
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)'
          }
        },
        // Bold the first row (headers) in "รายชื่อทีมขาย"
        {
          repeatCell: {
            range: {
              sheetId: spreadsheet.sheets[1].properties.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: salesHeader.length
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                },
                backgroundColor: {
                  red: 0.9,
                  green: 0.9,
                  blue: 0.9
                }
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)'
          }
        },
        // Auto-fit columns for both sheets
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: spreadsheet.sheets[0].properties.sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: workLogsHeader.length
            }
          }
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: spreadsheet.sheets[1].properties.sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: salesHeader.length
            }
          }
        }
      ]
    })
  });

  // Even if formatting fails, the data is still saved, so we can just log formatting failures
  if (!formatResponse.ok) {
    console.warn('Formatting spreadsheet failed, but data was saved.');
  }

  return spreadsheetUrl;
}
