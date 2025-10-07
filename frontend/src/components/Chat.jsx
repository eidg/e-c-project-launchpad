import { ChatProvider } from "../contexts/ChatProvider";
import ChatSidebar from "./ChatSidebar";
import ChatRoom from "./ChatRoom";

const Chat = () => {
  return (
    <ChatProvider>
      <div className="chat-container">
        <ChatSidebar />
        <ChatRoom />
      </div>
    </ChatProvider>
  );
};

export default Chat;
