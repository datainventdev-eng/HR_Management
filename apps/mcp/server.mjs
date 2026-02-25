import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.HR_API_URL || 'http://localhost:4000';
const ACCESS_TOKEN = process.env.HR_ACCESS_TOKEN || '';
const EMPLOYEE_ID = process.env.HR_EMPLOYEE_ID || '';
const ROLE = process.env.HR_ROLE || 'employee';

if (!ACCESS_TOKEN || !EMPLOYEE_ID) {
  console.error('Missing HR_ACCESS_TOKEN or HR_EMPLOYEE_ID for MCP timesheet server.');
}

const server = new Server(
  { name: 'hr-timesheet-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'x-role': ROLE,
    'x-employee-id': EMPLOYEE_ID,
  };
}

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers || {}),
    },
  });

  const raw = await res.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { message: raw };
  }

  if (!res.ok) {
    const msg = payload?.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  return payload;
}

function parseDurationToHhMm(value) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Duration is required.');
  if (/^\d+:\d{1,2}$/.test(input)) {
    const [h, m] = input.split(':').map(Number);
    if (m >= 60) throw new Error(`Invalid duration minutes in "${input}".`);
    return `${h}:${String(m).padStart(2, '0')}`;
  }
  const numeric = Number(input);
  if (Number.isNaN(numeric) || numeric <= 0) {
    throw new Error(`Invalid duration "${input}".`);
  }
  const totalMinutes = Math.round(numeric * 60);
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function parseBillable(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return ['1', 'true', 'yes', 'y', 'billable'].includes(normalized);
}

function parseEntries(summaryText, defaultDate) {
  // Format (one per line):
  // customer | project | duration | billable(optional) | notes(optional)
  // Optional date prefix: YYYY-MM-DD > customer | project | duration | ...
  return summaryText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const dateSplit = line.split('>');
      const hasDate = dateSplit.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(dateSplit[0].trim());
      const startDate = hasDate ? dateSplit[0].trim() : defaultDate;
      const recordText = hasDate ? dateSplit.slice(1).join('>').trim() : line;
      const parts = recordText.split('|').map((p) => p.trim());
      if (parts.length < 3) {
        throw new Error(`Line ${idx + 1}: Use "customer | project | duration | billable | notes".`);
      }
      const [customerName, projectName, durationRaw, billableRaw, ...notesParts] = parts;
      return {
        startDate,
        customerName,
        projectName,
        duration: parseDurationToHhMm(durationRaw),
        billable: parseBillable(billableRaw),
        notes: notesParts.join(' | ') || undefined,
      };
    });
}

function indexByName(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.name || '').trim().toLowerCase(), row);
  }
  return map;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_timesheet_catalog',
      description: 'List customers and projects available for timesheet logging.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'log_timesheet_from_text',
      description:
        'Log one or more timesheet single entries from plain text. Format per line: customer | project | duration | billable(optional) | notes(optional). Optional date prefix: YYYY-MM-DD > ...',
      inputSchema: {
        type: 'object',
        required: ['summary_text'],
        properties: {
          summary_text: {
            type: 'string',
            description: 'Multiline summary. One entry per line.',
          },
          date: {
            type: 'string',
            description: 'Default date for lines without explicit date, format YYYY-MM-DD.',
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (name === 'list_timesheet_catalog') {
    const catalog = await api('/timesheet/catalog');
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(catalog, null, 2),
        },
      ],
    };
  }

  if (name === 'log_timesheet_from_text') {
    const summaryText = String(args.summary_text || '').trim();
    if (!summaryText) {
      throw new Error('summary_text is required.');
    }

    const defaultDate = String(args.date || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultDate)) {
      throw new Error('date must be YYYY-MM-DD.');
    }

    const catalog = await api('/timesheet/catalog');
    const customerByName = indexByName(catalog.customers || []);
    const projectByName = indexByName(catalog.projects || []);
    const entries = parseEntries(summaryText, defaultDate);

    const results = [];
    for (const entry of entries) {
      const customer = customerByName.get(entry.customerName.toLowerCase());
      if (!customer) {
        results.push({ ...entry, status: 'failed', error: `Customer not found: ${entry.customerName}` });
        continue;
      }

      const project = projectByName.get(entry.projectName.toLowerCase());
      if (!project) {
        results.push({ ...entry, status: 'failed', error: `Project not found: ${entry.projectName}` });
        continue;
      }

      if (project.customerId && project.customerId !== customer.id) {
        results.push({
          ...entry,
          status: 'failed',
          error: `Project ${entry.projectName} is not under customer ${entry.customerName}.`,
        });
        continue;
      }

      try {
        const created = await api('/timesheet/single', {
          method: 'POST',
          body: JSON.stringify({
            customerId: customer.id,
            projectId: project.id,
            billable: entry.billable,
            startDate: entry.startDate,
            duration: entry.duration,
            notes: entry.notes,
          }),
        });
        results.push({ ...entry, status: 'ok', id: created.id });
      } catch (error) {
        results.push({
          ...entry,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const success = results.filter((r) => r.status === 'ok').length;
    const failed = results.length - success;

    return {
      content: [
        {
          type: 'text',
          text: `Processed ${results.length} line(s): ${success} saved, ${failed} failed.\n\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('HR Timesheet MCP server running over stdio.');
