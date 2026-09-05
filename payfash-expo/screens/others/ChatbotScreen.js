import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { askGroq, isGroqConfigured } from "../../utils/groq";

const WELCOME =
  "Bonjour 👋 Je suis ton assistant MoneyTrack. Comment puis-je t'aider à gérer ton budget aujourd'hui ?";

export default function ChatbotScreen() {
  const [messages, setMessages] = useState([
    { id: "1", text: WELCOME, sender: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(false);

  // Historique au format Groq (role/content) pour garder le contexte
  const historyRef = useRef([{ role: "assistant", content: WELCOME }]);
  const listRef = useRef(null);

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  useEffect(() => {
    scrollToEnd();
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { id: Date.now().toString(), text, sender: "me" };
    setMessages((prev) => [...prev, userMessage]);
    historyRef.current.push({ role: "user", content: text });
    setInput("");

    if (!isGroqConfigured()) {
      simulateBotResponse(
        "⚠️ La clé Groq n'est pas configurée. Ajoute EXPO_PUBLIC_GROQ_API_KEY dans le fichier .env puis relance l'application."
      );
      return;
    }

    try {
      setLoading(true);
      const reply = await askGroq(historyRef.current);
      historyRef.current.push({ role: "assistant", content: reply });
      setLoading(false);
      simulateBotResponse(reply);
    } catch (err) {
      console.log("Erreur Groq :", err.message);
      setLoading(false);
      simulateBotResponse(
        "Désolé, je n'ai pas pu répondre pour le moment. Réessaie dans un instant."
      );
    }
  };

  const simulateBotResponse = (fullText) => {
    setIsTyping(true);
    let index = 0;
    const botId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: botId, text: "", sender: "bot" }]);

    const interval = setInterval(() => {
      index++;
      if (index <= fullText.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botId ? { ...msg, text: fullText.slice(0, index) } : msg
          )
        );
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 18);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        <Text style={styles.headerText}>Assistant MoneyTrack</Text>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={{ paddingBottom: 10 }}
        onContentSizeChange={scrollToEnd}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.sender === "me" ? styles.myMessage : styles.botMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.sender === "me"
                  ? styles.myMessageText
                  : styles.botMessageText,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
      />

      {(isTyping || loading) && (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color="#4F46E5" />
          <Text style={styles.typingText}>
            {loading ? "L'assistant réfléchit..." : "L'assistant écrit..."}
          </Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Écrire un message..."
          value={input}
          onChangeText={setInput}
          placeholderTextColor={"#888"}
          onSubmitEditing={sendMessage}
          editable={!loading}
          multiline
        />
        <TouchableOpacity
          onPress={sendMessage}
          style={[styles.sendButton, loading && { opacity: 0.5 }]}
          disabled={loading}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F1FA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161427",
    padding: 15,
    justifyContent: "center",
  },
  headerText: { fontSize: 18, fontWeight: "bold", color: "#fff", marginLeft: 10 },
  messagesList: { flex: 1, padding: 10 },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    maxWidth: "78%",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  myMessage: {
    backgroundColor: "#4F46E5",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  botMessage: {
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E1F5",
  },
  messageText: { fontSize: 15, lineHeight: 21 },
  myMessageText: { color: "#fff" },
  botMessageText: { color: "#333" },
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 75,
    borderTopWidth: 1,
    borderColor: "#E5E1F5",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 10,
    color: "#111",
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: "#4F46E5",
    width: 44,
    height: 44,
    borderRadius: 22,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingBottom: 5,
    gap: 8,
  },
  typingText: { color: "#777", fontStyle: "italic" },
});
