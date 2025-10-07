import { useState } from "react";
import { useChat } from "../contexts/ChatProvider";

const ChatSidebar = () => {
  const { rooms, currentRoom, joinRoom, createRoom, onlineUsers, connected } =
    useChat();

  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreateRoom = async (e) => {
    e.preventDefault();

    if (!newRoomName.trim()) return;

    setCreating(true);
    const room = await createRoom(
      newRoomName.trim(),
      newRoomDescription.trim(),
      isPrivate,
    );

    if (room) {
      setShowCreateRoom(false);
      setNewRoomName("");
      setNewRoomDescription("");
      setIsPrivate(false);
      joinRoom(room.id);
    }

    setCreating(false);
  };

  const handleRoomClick = (room) => {
    if (room.name === "General") {
      joinRoom("general");
    } else {
      joinRoom(room.id);
    }
  };

  return (
    <div className="chat-sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <h2>E C Project Launchpad Chat</h2>
        <div className="connection-status">
          <span
            className={`status-dot ${connected ? "connected" : "disconnected"}`}
          ></span>
          <span className="status-text">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Rooms Section */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>Rooms</h3>
          <button
            className="add-button"
            onClick={() => setShowCreateRoom(true)}
            disabled={!connected}
            title="Create new room"
          >
            +
          </button>
        </div>

        <div className="rooms-list">
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`room-item ${currentRoom?.id === room.id ? "active" : ""}`}
              onClick={() => handleRoomClick(room)}
            >
              <div className="room-info">
                <span className="room-name">#{room.name}</span>
                <div className="room-meta">
                  <span className="participant-count">
                    {room.participantCount} members
                  </span>
                  {room.messageCount > 0 && (
                    <span className="message-count">
                      {room.messageCount} messages
                    </span>
                  )}
                </div>
              </div>
              {room.isPrivate && (
                <span className="private-indicator" title="Private room">
                  🔒
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Online Users Section */}
      <div className="sidebar-section">
        <div className="section-header">
          <h3>Online ({onlineUsers.length})</h3>
        </div>

        <div className="users-list">
          {onlineUsers.map((user) => (
            <div key={user.id} className="user-item">
              <div className="user-avatar">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-name">{user.email}</span>
                <span className="user-status">Online</span>
              </div>
              <span className="online-indicator">🟢</span>
            </div>
          ))}

          {onlineUsers.length === 0 && connected && (
            <div className="no-users">
              <p>No other users online</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div className="modal-overlay" onClick={() => setShowCreateRoom(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Room</h3>
              <button
                className="close-button"
                onClick={() => setShowCreateRoom(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="create-room-form">
              <div className="form-group">
                <label htmlFor="roomName">Room Name *</label>
                <input
                  type="text"
                  id="roomName"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Enter room name"
                  maxLength={255}
                  required
                  disabled={creating}
                />
              </div>

              <div className="form-group">
                <label htmlFor="roomDescription">Description</label>
                <textarea
                  id="roomDescription"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="Optional room description"
                  rows={3}
                  disabled={creating}
                />
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    disabled={creating}
                  />
                  <span className="checkmark"></span>
                  Private room (invite only)
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateRoom(false)}
                  disabled={creating}
                  className="cancel-button"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newRoomName.trim()}
                  className="create-button"
                >
                  {creating ? "Creating..." : "Create Room"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatSidebar;
