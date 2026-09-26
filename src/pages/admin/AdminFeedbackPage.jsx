import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  User,
  Search,
  Filter,
  Trash2
} from 'lucide-react';

const STATUS_TABS = [
  { id: 'all', label: 'All Queries' },
  { id: 'open', label: 'Open / Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
];

const AdminFeedbackPage = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTicket, setReplyTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [statusUpdate, setStatusUpdate] = useState('in_progress');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(query(collection(db, 'feedback')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setTickets(list);
      setLoading(false);
    }, (err) => {
      console.warn('Feedback listener err:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const statusMatch = selectedStatus === 'all' || (t.status || 'open') === selectedStatus;
      const searchMatch = !searchQuery.trim() ||
        (t.subject || t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.message || '').toLowerCase().includes(searchQuery.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [tickets, selectedStatus, searchQuery]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyTicket || !replyText.trim()) return;

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await updateDoc(doc(db, 'feedback', replyTicket.id), {
        adminReply: replyText.trim(),
        status: statusUpdate,
        repliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMessage('Response sent to student and ticket updated.');
      setReplyTicket(null);
      setReplyText('');
    } catch (err) {
      setError(err.message || 'Failed to reply to ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTicket = async (id) => {
    try {
      await deleteDoc(doc(db, 'feedback', id));
      setMessage('Ticket deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete ticket.');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Student Support & Helpdesk</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Student Feedback & Query Desk</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Review academic queries, technical issue reports, and feedback submitted by students from the student portal.
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Status Tabs */}
      <div className="tab-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${selectedStatus === tab.id ? 'active' : ''}`}
            onClick={() => setSelectedStatus(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search query by student name, subject, or message content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-2" style={{ gap: 16 }}>
        {filteredTickets.map((t) => {
          const status = t.status || 'open';
          const isResolved = status === 'resolved';
          const isInProgress = status === 'in_progress';

          return (
            <div
              key={t.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `5px solid ${isResolved ? '#059669' : isInProgress ? '#d97706' : '#3b82f6'}`,
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{t.studentName || 'Student'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {t.studentRoll || t.sifNumber || t.studentEmail || '-'} • {t.year || 'Student'}
                    </div>
                  </div>

                  <span
                    className="pill"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: isResolved ? '#dcfce7' : isInProgress ? '#fef3c7' : '#dbeafe',
                      color: isResolved ? '#15803d' : isInProgress ? '#b45309' : '#1d4ed8',
                    }}
                  >
                    {isResolved ? 'Resolved' : isInProgress ? 'In Progress' : 'Open'}
                  </span>
                </div>

                <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: '#1e293b' }}>
                    {t.subject || t.title || 'Support Query'}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
                    {t.message || t.query || 'No description provided.'}
                  </p>
                </div>

                {t.adminReply && (
                  <div style={{ marginTop: 10, padding: 10, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--color-primary)', marginBottom: 2 }}>
                      Admin Reply:
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#1e3a8a' }}>
                      {t.adminReply}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : 'Recent'}
                </span>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => {
                      setReplyTicket(t);
                      setReplyText(t.adminReply || '');
                      setStatusUpdate(t.status === 'open' ? 'in_progress' : t.status || 'in_progress');
                    }}
                  >
                    {t.adminReply ? 'Update Reply' : 'Reply'}
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 12, color: '#ef4444' }}
                    onClick={() => handleDeleteTicket(t.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTickets.length === 0 && (
        <EmptyState message="No student queries or feedback tickets found." />
      )}

      {/* Reply Modal */}
      {replyTicket && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setReplyTicket(null); }}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Reply to Student Query</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setReplyTicket(null)}>✕</button>
            </div>

            <form onSubmit={handleSendReply}>
              <div className="modal-body">
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                  <strong>From:</strong> {replyTicket.studentName} ({replyTicket.studentEmail || replyTicket.sifNumber || ''})
                  <div style={{ marginTop: 4, color: '#475569' }}>
                    <strong>Subject:</strong> {replyTicket.subject || replyTicket.title}
                  </div>
                </div>

                <div>
                  <label className="form-label">Update Status</label>
                  <select className="input" value={statusUpdate} onChange={(e) => setStatusUpdate(e.target.value)}>
                    <option value="in_progress">In Progress (Under Review)</option>
                    <option value="resolved">Resolved (Close Ticket)</option>
                    <option value="open">Open</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Admin Response / Solution *</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Type reply to student..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setReplyTicket(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Sending...' : 'Send Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeedbackPage;
