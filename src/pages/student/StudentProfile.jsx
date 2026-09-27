import React, { useEffect, useMemo, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "../../services/studentMongoApi";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase";
import StudentPageHeader from "../../components/studentui/StudentPageHeader";
import StudentContentCard from "../../components/studentui/StudentContentCard";
import StatusBadge from "../../components/studentui/StatusBadge";
import InstallPWA from "../../components/InstallPWA";
import { formatDisplayDob } from "../../utils/studentImport";
import {
  IdCard,
  Calendar,
  Smartphone,
  GraduationCap,
  Layers,
  Users,
  Hash,
  Mail,
  Heart,
  UserCheck,
  ShieldCheck,
  Award,
  BookOpen
} from "lucide-react";

const StudentProfile = () => {
  const { profile, user, refreshProfile } = useAuth();
  const [details, setDetails] = useState({ address: "", parentName: "", parentMobile: "", emergencyContact: "", bloodGroup: "" });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setDetails({
      address: profile?.address || "",
      parentName: profile?.parentName || "",
      parentMobile: profile?.parentMobile || "",
      emergencyContact: profile?.emergencyContact || "",
      bloodGroup: profile?.bloodGroup || "",
    });
  }, [profile]);

  const saveDetails = async (event) => {
    event.preventDefault();
    if (!user?.uid) return;
    setSaving(true);
    setSaveMessage("");
    try {
      await updateDoc(doc(db, "users", user.uid), { ...details, profileUpdatedAt: serverTimestamp() });
      await refreshProfile();
      setSaveMessage("Your profile details have been saved.");
    } catch (error) {
      console.error("Could not save student profile:", error);
      setSaveMessage("Could not save your details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateDetail = (event) => setDetails((current) => ({ ...current, [event.target.name]: event.target.value }));

  const initials = useMemo(
    () => (profile?.name || "ST").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
    [profile?.name]
  );

  const roleLabel = useMemo(() => {
    const role = (profile?.role || "student").toString().trim();
    return role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : "Student";
  }, [profile?.role]);

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Student Profile & ID Card"
        subtitle="Official Student Identification & Academic Record"
      />

      {/* Profile Banner */}
      <StudentContentCard className="profile-banner">
        <div className="profile-avatar" title={profile?.name || "Student"}>
          {initials}
        </div>
        <div className="profile-text">
          <div className="profile-title">{profile?.name || "Student"}</div>
          <div className="profile-sub" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#2563eb" }}>
              SIF: {profile?.sifNumber || "-"}
            </span>
            {profile?.rollNumber && (
              <span>&bull; Roll: <strong>{profile.rollNumber}</strong></span>
            )}
            <span>&bull; {profile?.email}</span>
          </div>
          <div className="profile-badges" style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <StatusBadge status={roleLabel} type="neutral" />
            <StatusBadge status="Active Academic Status" type="success" />
            {profile?.section && (
              <span className="badge badge-secondary" style={{ fontSize: 11 }}>
                Section {profile.section}
              </span>
            )}
          </div>
        </div>
      </StudentContentCard>

      {/* Student Details Grid */}
      <StudentContentCard>
        <h4 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>
          Student Credentials & Academic Information
        </h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16
          }}
        >
          {/* SIF Number */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <IdCard size={15} color="#2563eb" /> SIF Number
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#2563eb", fontFamily: "monospace" }}>
              {profile?.sifNumber || "-"}
            </div>
          </div>

          {/* Roll Number */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Hash size={15} color="#6366f1" /> Roll Number
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
              {profile?.rollNumber || profile?.registerNumber || "-"}
            </div>
          </div>

          {/* Email */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Mail size={15} color="#0ea5e9" /> Email Address
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
              {profile?.email || "-"}
            </div>
          </div>

          {/* Date of Birth */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Calendar size={15} color="#8b5cf6" /> Date of Birth
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {formatDisplayDob(profile?.dob)}
            </div>
          </div>

          {/* Mobile Number */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Smartphone size={15} color="#10b981" /> Mobile Number
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {profile?.mobileNumber || "-"}
            </div>
          </div>

          {/* Academic Year */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <GraduationCap size={15} color="#f59e0b" /> Academic Year
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {profile?.year || "-"}
            </div>
          </div>

          {/* Class / Department */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Layers size={15} color="#ec4899" /> Class / Department
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {profile?.class || profile?.departmentName || "B.A. Tamil"}
            </div>
          </div>

          {/* Section */}
          <div style={{ padding: 14, borderRadius: 10, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              <Users size={15} color="#06b6d4" /> Section
            </div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              Section {profile?.section || "A"}
            </div>
          </div>
        </div>
      </StudentContentCard>

      {/* Student-editable personal and family details. Imported academic identity stays read-only. */}
      <StudentContentCard>
        <h4 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>
          Personal & Emergency Information
        </h4>
        <form onSubmit={saveDetails} className="grid grid-2" style={{ gap: 14 }}>
          {[
            ["address", "Home Address", "textarea"],
            ["parentName", "Parent / Guardian Name", "text"],
            ["parentMobile", "Parent / Guardian Mobile", "tel"],
            ["emergencyContact", "Emergency Contact", "tel"],
            ["bloodGroup", "Blood Group", "text"],
          ].map(([name, label, type]) => (
            <label key={name} className="form-group" style={{ display: "grid", gap: 6 }}>
              <span className="form-label">{label}</span>
              {type === "textarea" ? (
                <textarea className="input" name={name} rows={3} value={details[name]} onChange={updateDetail} maxLength={500} />
              ) : (
                <input className="input" name={name} type={type} value={details[name]} onChange={updateDetail} maxLength={name === "bloodGroup" ? 5 : 100} />
              )}
            </label>
          ))}
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Personal Details"}</button>
            {saveMessage && <span role="status" style={{ color: saveMessage.startsWith("Could not") ? "#dc2626" : "#15803d" }}>{saveMessage}</span>}
          </div>
        </form>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
          Your name, SIF and roll numbers, date of birth, mobile number, class, year, department, and section are maintained by the administration.
        </p>

        {/* PWA Install Button */}
        <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
          <InstallPWA
            className="btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              borderRadius: "8px",
              background: "var(--color-primary)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: "600"
            }}
          />
        </div>
      </StudentContentCard>
    </div>
  );
};

export default StudentProfile;
export { StudentProfile };
