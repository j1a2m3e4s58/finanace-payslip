import React, { useEffect, useState } from "react";
import { Bell, CheckCheck, Inbox, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/api/portalClient";

function formatTime(value) {
  if (!value) return "";
  return new Date(Number(value)).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const loadNotifications = async () => {
    try {
      const items = await getNotifications();
      setNotifications(items);
      setSelectedIds([]);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleRead = async (item) => {
    if (item.isRead) return;
    await markNotificationRead(item.id);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, isRead: true } : notification
      )
    );
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true }))
    );
  };

  const selectedSet = new Set(selectedIds);
  const allSelected =
    notifications.length > 0 && selectedIds.length === notifications.length;

  const toggleSelected = (id) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : notifications.map((item) => item.id));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    setError("");
    try {
      await Promise.all(selectedIds.map((id) => deleteNotification(id)));
      setNotifications((current) =>
        current.filter((item) => !selectedSet.has(item.id))
      );
      setSelectedIds([]);
    } catch (err) {
      setError(err.message || "Could not delete selected notifications");
    } finally {
      setDeleting(false);
    }
  };

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-kicker">
            Notification center
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-heading text-2xl font-bold text-foreground lg:text-3xl">
            <Bell className="h-7 w-7 text-primary" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review system messages, approvals, and staff updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {notifications.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={toggleSelectAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : `Delete (${selectedIds.length})`}
            </Button>
          )}
          <Button className="gap-2" onClick={handleReadAll} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((item) => {
              const title = item.title || item.type || "Notification";
              const message = item.message || item.body || item.description || "";
              return (
                <div
                  key={item.id}
                  className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/60 ${
                    selectedSet.has(item.id) ? "bg-primary/10" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    onClick={(event) => event.stopPropagation()}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--primary))]"
                    aria-label={`Select ${title}`}
                  />
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.isRead ? "bg-muted-foreground/30" : "bg-primary"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleRead(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-sm font-semibold text-foreground">{title}</span>
                    {message && (
                      <span className="mt-1 block text-sm text-muted-foreground">{message}</span>
                    )}
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {formatTime(item.createdAt)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
