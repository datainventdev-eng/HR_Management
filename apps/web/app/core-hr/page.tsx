'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getSession } from '../lib.session';
import { FeedbackMessage } from '../components/ui-feedback';

type Department = { id: string; name: string; code?: string };
type Customer = { id: string; name: string; description?: string };
type Project = { id: string; customerId: string; customerName?: string; name: string; description?: string };
type Employee = {
  id: string;
  fullName: string;
  employeeId: string;
  joinDate: string;
  departmentId: string;
  title: string;
  managerId?: string;
  status: 'active' | 'inactive';
};

type LifecycleEvent = {
  id: string;
  employeeId: string;
  type: 'transfer' | 'promotion' | 'resignation' | 'termination';
  effectiveDate: string;
  notes?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function CoreHrPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEvent[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState('');
  const [message, setMessage] = useState('');

  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '' });
  const [customerForm, setCustomerForm] = useState({ name: '', description: '' });
  const [projectForm, setProjectForm] = useState({ customerId: '', name: '', description: '' });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerEditForm, setCustomerEditForm] = useState({ name: '', description: '' });
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectEditForm, setProjectEditForm] = useState({ customerId: '', name: '', description: '' });
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeEditForm, setEmployeeEditForm] = useState({
    fullName: '',
    departmentId: '',
    title: '',
    managerId: '',
    status: 'active' as Employee['status'],
  });
  const [lifecycleForm, setLifecycleForm] = useState({
    employeeId: '',
    type: 'promotion' as LifecycleEvent['type'],
    effectiveDate: '',
    notes: '',
  });

  async function callApi(path: string, init?: RequestInit) {
    const session = getSession();
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        'x-role': 'hr_admin',
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message ?? 'Request failed.');
    }

    return payload;
  }

  async function refresh() {
    try {
      const [departmentData, customerData, projectData, employeeData] = await Promise.all([
        callApi('/core-hr/departments'),
        callApi('/core-hr/customers'),
        callApi('/core-hr/projects'),
        callApi('/core-hr/employees'),
      ]);
      setDepartments(departmentData);
      setCustomers(customerData);
      setProjects(projectData);
      setEmployees(employeeData);
      setMessage('Core HR data refreshed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load data.');
    }
  }

  async function seedDemo() {
    try {
      const result = await callApi('/core-hr/seed-demo', { method: 'POST' });
      setMessage(result.message);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to seed demo data.');
    }
  }

  async function createDepartment(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/departments', {
        method: 'POST',
        body: JSON.stringify(departmentForm),
      });
      setDepartmentForm({ name: '', code: '' });
      await refresh();
      setMessage('Department created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create department.');
    }
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/customers', {
        method: 'POST',
        body: JSON.stringify(customerForm),
      });
      setCustomerForm({ name: '', description: '' });
      await refresh();
      setMessage('Customer created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create customer.');
    }
  }

  function startCustomerEdit(customer: Customer) {
    setEditingCustomerId(customer.id);
    setCustomerEditForm({ name: customer.name, description: customer.description || '' });
  }

  async function saveCustomerEdit() {
    if (!editingCustomerId) return;
    try {
      await callApi(`/core-hr/customers/${editingCustomerId}`, {
        method: 'PATCH',
        body: JSON.stringify(customerEditForm),
      });
      setEditingCustomerId(null);
      setMessage('Customer updated.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update customer.');
    }
  }

  async function deleteCustomer(customer: Customer) {
    if (!window.confirm(`Delete customer "${customer.name}"?`)) return;
    try {
      await callApi(`/core-hr/customers/${customer.id}`, { method: 'DELETE' });
      setMessage('Customer deleted.');
      if (editingCustomerId === customer.id) setEditingCustomerId(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete customer.');
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/projects', {
        method: 'POST',
        body: JSON.stringify(projectForm),
      });
      setProjectForm({ customerId: '', name: '', description: '' });
      await refresh();
      setMessage('Project created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create project.');
    }
  }

  function startProjectEdit(project: Project) {
    setEditingProjectId(project.id);
    setProjectEditForm({
      customerId: project.customerId,
      name: project.name,
      description: project.description || '',
    });
  }

  async function saveProjectEdit() {
    if (!editingProjectId) return;
    try {
      await callApi(`/core-hr/projects/${editingProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify(projectEditForm),
      });
      setEditingProjectId(null);
      setMessage('Project updated.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update project.');
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    try {
      await callApi(`/core-hr/projects/${project.id}`, { method: 'DELETE' });
      setMessage('Project deleted.');
      if (editingProjectId === project.id) setEditingProjectId(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete project.');
    }
  }

  function startEmployeeEdit(employee: Employee) {
    setEditingEmployeeId(employee.id);
    setEmployeeEditForm({
      fullName: employee.fullName,
      departmentId: employee.departmentId,
      title: employee.title,
      managerId: employee.managerId || '',
      status: employee.status,
    });
  }

  async function saveEmployeeEdit() {
    if (!editingEmployeeId) return;
    try {
      await callApi(`/core-hr/employees/${editingEmployeeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: employeeEditForm.fullName,
          departmentId: employeeEditForm.departmentId,
          title: employeeEditForm.title,
          managerId: employeeEditForm.managerId || undefined,
          status: employeeEditForm.status,
        }),
      });
      setEditingEmployeeId(null);
      setMessage('Employee updated.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update employee.');
    }
  }

  async function deleteEmployee(employee: Employee) {
    if (!window.confirm(`Delete employee "${employee.fullName}"?`)) return;
    try {
      await callApi(`/core-hr/employees/${employee.id}`, { method: 'DELETE' });
      setMessage('Employee deleted.');
      if (editingEmployeeId === employee.id) setEditingEmployeeId(null);
      if (activeEmployeeId === employee.id) {
        setActiveEmployeeId('');
        setLifecycleEvents([]);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete employee.');
    }
  }

  async function addLifecycleEvent(event: FormEvent) {
    event.preventDefault();
    try {
      await callApi('/core-hr/lifecycle-events', {
        method: 'POST',
        body: JSON.stringify(lifecycleForm),
      });

      if (activeEmployeeId) {
        await loadLifecycleHistory(activeEmployeeId);
      }

      setLifecycleForm({
        employeeId: '',
        type: 'promotion',
        effectiveDate: '',
        notes: '',
      });
      setMessage('Lifecycle event added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add lifecycle event.');
    }
  }

  async function loadLifecycleHistory(employeeId: string) {
    setActiveEmployeeId(employeeId);
    try {
      const history = await callApi(`/core-hr/employees/${employeeId}/lifecycle-events`);
      setLifecycleEvents(history);
      setMessage(`Loaded lifecycle history for employee ${employeeId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load lifecycle history.');
    }
  }

  async function viewReports(managerId: string) {
    try {
      const reports = await callApi(`/core-hr/managers/${managerId}/reports`);
      setMessage(`Manager has ${reports.length} direct report(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to load direct reports.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="core-hr-page">
      <header className="card">
        <h1>Core HR</h1>
        <p>V1 workflows for departments, employee management, and lifecycle history.</p>
        <small>New employee creation is handled from User Access.</small>
        <input className="core-hr-search" aria-label="Core HR Search" placeholder="Search employees, departments, customers, or projects..." />
        <div className="core-hr-actions">
          <button type="button" onClick={seedDemo}>
            Seed Demo Data
          </button>
          <button type="button" onClick={refresh}>
            Refresh Data
          </button>
        </div>
        <FeedbackMessage message={message} />
      </header>

      <section className="core-hr-grid">
        <article className="card">
          <h2>Create Department</h2>
          <form onSubmit={createDepartment} className="form-grid">
            <input
              placeholder="Department name"
              value={departmentForm.name}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              placeholder="Code (optional)"
              value={departmentForm.code}
              onChange={(event) => setDepartmentForm((prev) => ({ ...prev, code: event.target.value }))}
            />
            <button type="submit">Save Department</button>
          </form>
          <ul className="simple-list">
            {departments.map((department) => (
              <li key={department.id}>
                {department.name} {department.code ? `(${department.code})` : ''}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Create Customer</h2>
          <form onSubmit={createCustomer} className="form-grid">
            <input
              placeholder="Customer name"
              value={customerForm.name}
              onChange={(event) => setCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              placeholder="Description"
              value={customerForm.description}
              onChange={(event) => setCustomerForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <button type="submit">Save Customer</button>
          </form>
          <ul className="simple-list">
            {customers.map((customer) => (
              <li key={customer.id} className="list-item-actions">
                {editingCustomerId === customer.id ? (
                  <div className="inline-edit-grid">
                    <input
                      value={customerEditForm.name}
                      onChange={(event) => setCustomerEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Customer name"
                    />
                    <input
                      value={customerEditForm.description}
                      onChange={(event) => setCustomerEditForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Description"
                    />
                    <div className="icon-actions">
                      <button type="button" title="Save" onClick={saveCustomerEdit} aria-label="Save customer">✓</button>
                      <button type="button" title="Cancel" onClick={() => setEditingCustomerId(null)} aria-label="Cancel">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span>
                      <strong>{customer.name}</strong> {customer.description ? `- ${customer.description}` : ''}
                    </span>
                    <div className="icon-actions">
                      <button type="button" title="Edit" onClick={() => startCustomerEdit(customer)} aria-label="Edit customer">✎</button>
                      <button type="button" title="Delete" onClick={() => deleteCustomer(customer)} aria-label="Delete customer">🗑</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Create Project</h2>
          <form onSubmit={createProject} className="form-grid">
            <select
              value={projectForm.customerId}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, customerId: event.target.value }))}
              required
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Project name"
              value={projectForm.name}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              placeholder="Description"
              value={projectForm.description}
              onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
            />
            <button type="submit" disabled={!projectForm.customerId}>
              Save Project
            </button>
          </form>
          <ul className="simple-list">
            {projects.map((project) => (
              <li key={project.id} className="list-item-actions">
                {editingProjectId === project.id ? (
                  <div className="inline-edit-grid">
                    <select
                      value={projectEditForm.customerId}
                      onChange={(event) => setProjectEditForm((prev) => ({ ...prev, customerId: event.target.value }))}
                    >
                      <option value="">Select customer</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={projectEditForm.name}
                      onChange={(event) => setProjectEditForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Project name"
                    />
                    <input
                      value={projectEditForm.description}
                      onChange={(event) => setProjectEditForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Description"
                    />
                    <div className="icon-actions">
                      <button type="button" title="Save" onClick={saveProjectEdit} aria-label="Save project">✓</button>
                      <button type="button" title="Cancel" onClick={() => setEditingProjectId(null)} aria-label="Cancel">✕</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span>
                      <strong>{project.name}</strong>
                      {project.customerName ? ` (${project.customerName})` : ''}
                      {project.description ? ` - ${project.description}` : ''}
                    </span>
                    <div className="icon-actions">
                      <button type="button" title="Edit" onClick={() => startProjectEdit(project)} aria-label="Edit project">✎</button>
                      <button type="button" title="Delete" onClick={() => deleteProject(project)} aria-label="Delete project">🗑</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Employee List and Manager View</h2>
          <ul className="simple-list">
            {employees.map((employee) => (
              <li key={employee.id}>
                {editingEmployeeId === employee.id ? (
                  <div className="inline-edit-stack">
                    <input
                      value={employeeEditForm.fullName}
                      onChange={(event) => setEmployeeEditForm((prev) => ({ ...prev, fullName: event.target.value }))}
                      placeholder="Full name"
                    />
                    <input value={employee.employeeId} disabled />
                    <select
                      value={employeeEditForm.departmentId}
                      onChange={(event) => setEmployeeEditForm((prev) => ({ ...prev, departmentId: event.target.value }))}
                    >
                      <option value="">Select department</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={employeeEditForm.title}
                      onChange={(event) => setEmployeeEditForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Role/Title"
                    />
                    <select
                      value={employeeEditForm.managerId}
                      onChange={(event) => setEmployeeEditForm((prev) => ({ ...prev, managerId: event.target.value }))}
                    >
                      <option value="">No manager</option>
                      {employees
                        .filter((manager) => manager.id !== employee.id)
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.fullName}
                          </option>
                        ))}
                    </select>
                    <select
                      value={employeeEditForm.status}
                      onChange={(event) =>
                        setEmployeeEditForm((prev) => ({ ...prev, status: event.target.value as Employee['status'] }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <div className="icon-actions">
                      <button type="button" title="Save" onClick={saveEmployeeEdit} aria-label="Save employee">✓</button>
                      <button type="button" title="Cancel" onClick={() => setEditingEmployeeId(null)} aria-label="Cancel">✕</button>
                    </div>
                  </div>
                ) : (
                  <div className="list-item-actions">
                    <div>
                      <strong>{employee.fullName}</strong> ({employee.employeeId}) - {employee.title}
                    </div>
                    <div className="row-actions">
                      <button type="button" onClick={() => loadLifecycleHistory(employee.id)}>
                        Lifecycle
                      </button>
                      <button type="button" onClick={() => viewReports(employee.id)}>
                        Direct Reports
                      </button>
                      <div className="icon-actions">
                        <button type="button" title="Edit" onClick={() => startEmployeeEdit(employee)} aria-label="Edit employee">✎</button>
                        <button type="button" title="Delete" onClick={() => deleteEmployee(employee)} aria-label="Delete employee">🗑</button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Add Lifecycle Event</h2>
          <form onSubmit={addLifecycleEvent} className="form-grid">
            <select
              value={lifecycleForm.employeeId}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              required
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
            <select
              value={lifecycleForm.type}
              onChange={(event) =>
                setLifecycleForm((prev) => ({
                  ...prev,
                  type: event.target.value as LifecycleEvent['type'],
                }))
              }
            >
              <option value="promotion">Promotion</option>
              <option value="transfer">Transfer</option>
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
            </select>
            <input
              type="date"
              value={lifecycleForm.effectiveDate}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
              required
            />
            <input
              placeholder="Notes (optional)"
              value={lifecycleForm.notes}
              onChange={(event) => setLifecycleForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <button type="submit">Add Event</button>
          </form>
          <h3>Lifecycle History {activeEmployeeId ? `(Employee: ${activeEmployeeId})` : ''}</h3>
          <ul className="simple-list">
            {lifecycleEvents.map((event) => (
              <li key={event.id}>
                {event.type} on {event.effectiveDate} {event.notes ? `- ${event.notes}` : ''}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
