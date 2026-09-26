import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import CursorTrail from '../../components/CursorTrail';

const StudentSignup = () => {
  const navigate = useNavigate();
  const { signupStudent } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    year: '',
    departmentId: '',
  });
  const [departments, setDepartments] = useState([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      setDeptLoading(true);
      try {
        const departmentsQuery = query(
          collection(db, 'departments'),
          where('isActive', '==', true)
        );
        const snap = await getDocs(departmentsQuery);
        const list = snap.docs
          .map((departmentDoc) => ({ id: departmentDoc.id, ...departmentDoc.data() }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setDepartments(list);
      } catch (err) {
        setError('Failed to load departments. Please try again.');
      } finally {
        setDeptLoading(false);
      }
    };

    loadDepartments();
  }, []);

  const departmentsForYear = useMemo(() => (
    departments.filter((department) => form.year && department.year === form.year && department.isActive === true)
  ), [departments, form.year]);

  useEffect(() => {
    const currentValid = departmentsForYear.some((department) => department.id === form.departmentId);
    if (!currentValid && form.departmentId !== '') {
      setForm((prev) => ({ ...prev, departmentId: '' }));
    }
  }, [departmentsForYear, form.departmentId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = form.email.trim().toLowerCase();

    if (!form.year) {
      setError('Please select year.');
      return;
    }
    if (!form.departmentId) {
      setError('Please select department.');
      return;
    }

    const selectedDepartment = departmentsForYear.find((department) => department.id === form.departmentId);
    if (!selectedDepartment) {
      setError('Please select a valid department.');
      return;
    }

    const payload = {
      ...form,
      email: cleanEmail,
      year: form.year,
      departmentId: selectedDepartment.id,
      departmentName: selectedDepartment.name,
    };

    setError('');
    setInfo('');
    setLoading(true);
    try {
      const result = await signupStudent(payload);
      setInfo(result?.message || 'Verification email sent. Please check your inbox.');
      setTimeout(() => navigate('/auth/student-login'), 1200);
    } catch (err) {
      setError(err?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <CursorTrail />
      <div className="auth-shell page-enter">
        <Card className="auth-card" glass>
          <h2 style={{ marginBottom: 6, textAlign: 'center' }}>Create Student Account</h2>
          <p className="muted" style={{ marginTop: 0, marginBottom: 18, textAlign: 'center' }}>
            Verification email will be sent immediately after signup.
          </p>
          <form className="grid" style={{ gap: 12 }} onSubmit={handleSubmit}>
            <Input placeholder="Full name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="Email" type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input placeholder="Password (min 6 chars)" type="password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
            <Select
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value, departmentId: '' })}
              required
            >
              <option value="">Select Year</option>
              {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
            </Select>
            <Select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              disabled={deptLoading || !form.year}
              required
            >
              {!form.year && <option value="">Select Year First</option>}
              {form.year && <option value="">Select Department</option>}
              {form.year && departmentsForYear.length === 0 && <option value="">No active departments for this year</option>}
              {departmentsForYear.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </Select>
            {error && <div className="alert error">{error}</div>}
            {info && <div className="alert success">{info}</div>}
            <Button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Sign Up'}</Button>
            <div style={{ fontSize: 14, textAlign: 'center' }}>
              Already have an account? <Link to="/auth/student-login">Login</Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

export default StudentSignup;
