import React, { useState, useRef, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { sendMessage, subscribeToMessages, markConversationAsRead, clearMessages, getConversationById } from '../services/chat';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { uploadImage, uploadDocument } from '../services/upload';
import { useUIStore } from '../store/useStore';

// Import MaterialIcons - handle both ES6 and CommonJS
let MaterialIcons;
try {
  const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
  MaterialIcons = MaterialIconModule.default || MaterialIconModule;
  if (typeof MaterialIcons !== 'function') {
    MaterialIcons = ({ name, size, color, style }) => (
      <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
  }
} catch (error) {
  console.error('Error importing MaterialIcons:', error);
  MaterialIcons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const Messages = ({ navigation, route }) => {
  const conversation = route?.params?.conversation || navigation?.getParam?.('conversation');
  const { user } = useContext(AuthContext);
  const ui = (useUIStore && typeof useUIStore === 'function') ? useUIStore() : { showToast: () => {} };
  const showToast = ui.showToast || (() => {});
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showClearChatModal, setShowClearChatModal] = useState(false);

  // Default conversation data if not provided (should be provided by Inbox)
  const defaultConversation = {
    id: 'temp',
    name: 'User',
    avatar: '👤',
    subtitle: ''
  };

  const currentConversation = conversation || defaultConversation;
  const [headerConversation, setHeaderConversation] = useState(currentConversation);

  // Get IDs from user object safely
  const userId = user?._id || user?.id; // backend uses _id usually
  const userRole = user?.role?.toLowerCase() || 'creator'; // 'brand' or 'creator'/'influencer'

  // Get first letter of name for avatar text
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollViewRef = useRef(null);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!currentConversation?.id) {
      setLoading(false);
      return;
    }

    let scrollTimeoutId = null;

    // Safety timeout: if Firestore doesn't respond within 5s (e.g. empty convo),
    // stop the spinner to show the empty-state 'Say hello!' message.
    const loadingTimeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // Mark as read when opening (conversationId, userRole)
    markConversationAsRead(currentConversation.id, userRole);

    const unsubscribe = subscribeToMessages(currentConversation.id, (newMessages) => {
      clearTimeout(loadingTimeoutId); // Firestore responded — cancel the timeout
      setMessages(newMessages);
      setLoading(false);

      // If we're on the screen and get a new message, mark as read
      markConversationAsRead(currentConversation.id, userRole);

      // Scroll to bottom on new messages
      scrollTimeoutId = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      unsubscribe();
      clearTimeout(loadingTimeoutId);
      if (scrollTimeoutId) clearTimeout(scrollTimeoutId);
    };
  }, [currentConversation?.id]);

  // Resolve header (name, avatar, subtitle) from Firestore if missing/minimal
  useEffect(() => {
    let isMounted = true;
    const loadHeader = async () => {
      if (!currentConversation?.id) return;
      const hasMinimal =
        !currentConversation.name ||
        currentConversation.name === 'Chat' ||
        currentConversation.avatar === '' ||
        !currentConversation.subtitle;
      if (!hasMinimal) {
        setHeaderConversation(currentConversation);
        return;
      }
      try {
        const conv = await getConversationById(currentConversation.id);
        if (!conv || !isMounted) return;
        const isBrand = userRole === 'brand';
        const otherName = isBrand ? (conv.influencerName || 'Creator') : (conv.brandName || 'Brand');
        const otherAvatar = isBrand ? (conv.influencerAvatar || '') : (conv.brandAvatar || '');
        const otherSubtitle = isBrand ? 'Creator' : 'Brand';
        setHeaderConversation({
          id: conv.id,
          name: otherName,
          avatar: otherAvatar || (otherName ? otherName.substring(0, 2).toUpperCase() : '??'),
          subtitle: otherSubtitle
        });
      } catch (e) {
        // Fallback to current param
        setHeaderConversation(currentConversation);
      }
    };
    loadHeader();
    return () => { isMounted = false; };
  }, [currentConversation?.id, currentConversation?.name, currentConversation?.avatar, userRole]);

  const getCurrentTime = (date) => {
    if (!date) return '';
    const now = date instanceof Date ? date : new Date(date);
    return now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    // Optimistic UI update could be added here, 
    // but Firestore is fast enough usually

    try {
      const textToSend = messageText.trim();
      setMessageText(''); // Clear input immediately

      // If we don't have a valid conversation ID yet (e.g. creating new chat), we might need to create it first
      // For now, assuming conversation exists passed from Inbox

      await sendMessage(
        currentConversation.id,
        {
          text: textToSend,
          isOffer: false,
          isUser: true // This is just for local UI logic if we weren't using senderId check
        },
        userId,
        userRole
      );

    } catch (error) {
      console.error('Error sending message:', error);
      const isSupportChat = (route?.params?.conversation?.name || '').toLowerCase().includes('support');
      showToast(
        isSupportChat
          ? 'Could not send to support. Please email support@influencerapp.com and we\'ll reply within 24 hours.'
          : 'Failed to send message. Please try again.',
        'error'
      );
    }
  };

  const handleFileAttachment = () => {
    setShowAttachModal(true);
  };

  const handleImagePick = async (source) => {
    try {
      const options = {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1920,
      };

      let result;
      if (source === 'camera') {
        result = await launchCamera(options);
      } else {
        result = await launchImageLibrary(options);
      }

      if (result.didCancel || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];

      // Upload to Cloudinary
      const uploadResponse = await uploadImage({
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || `image_${Date.now()}.jpg`,
      });

      if (uploadResponse?.data?.url) {
        // Send file message
        await sendMessage(
          currentConversation.id,
          {
            isFile: true,
            fileUrl: uploadResponse.data.url,
            fileName: asset.fileName || 'image.jpg',
            fileSize: asset.fileSize,
            fileType: 'image',
            text: '', // Empty text for file messages
          },
          userId,
          userRole
        );
      } else {
        throw new Error('Upload failed - no URL returned');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast(error.message || 'Failed to upload image. Please try again.', 'error');
    }
  };

  const handleDocumentPick = () => {
    setShowAttachModal(false);
    showToast('Document upload will be available in the next update.', 'info');
  };


  // Helper to check if message is from current user
  const isMessageFromUser = (message) => {
    return message.senderId === userId;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            // For AppNavigator, navigating to 'Messages' brings the user back to the Inbox
            if (navigation?.navigate) {
              navigation.navigate('Messages');
            } else if (navigation?.goBack) {
              navigation.goBack();
            }
          }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#2d3748" />
        </TouchableOpacity>

        <View style={styles.profileSection}>
          <View style={styles.profileImageContainer}>
            <View style={styles.profileImage}>
              {headerConversation.avatar && headerConversation.avatar.length > 5 && (headerConversation.avatar.startsWith('http') || headerConversation.avatar.startsWith('file')) ? (
                <Image source={{ uri: headerConversation.avatar }} style={styles.avatarImage} />
              ) : headerConversation.avatar && headerConversation.avatar.length < 5 ? (
                <Text style={styles.profileImageEmoji}>{headerConversation.avatar}</Text>
              ) : (
                <Text style={styles.profileImageText}>{getInitials(headerConversation.name)}</Text>
              )}
            </View>
            <View style={styles.onlineIndicator} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{headerConversation.name}</Text>
            <Text style={styles.profileTitle}>
              {headerConversation.subtitle || 'User'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => setShowClearChatModal(true)}
        >
          <MaterialIcons name="more-vert" size={24} color="#2d3748" />
        </TouchableOpacity>
      </View>

      {/* Chat Area */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#337DEB" style={{ marginTop: 20 }} />
        ) : (
          <>
            {/* Date Separator */}
            <View style={styles.dateSeparator}>
              <Text style={styles.dateText}>Today</Text>
            </View>

            {/* Messages */}
            {messages.length === 0 ? (
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            ) : (
              messages.map((message) => {
                const isUser = isMessageFromUser(message);
                return (
                  <View key={message.id} style={styles.messageContainer}>
                    {message.isOffer && (
                      <TouchableOpacity
                        style={[styles.offerCard, isUser && styles.offerCardOutgoing]}
                        onPress={() => navigation?.navigate('OfferDetails', { offerId: message.offerData?.id || message.offerData?.offerId })}
                      >
                        <View style={[styles.offerImageContainer, isUser && styles.offerCardOutgoingInner]}>
                          {message.offerData?.image && (message.offerData.image.startsWith('http') || message.offerData.image.startsWith('file')) ? (
                            <Image source={{ uri: message.offerData.image }} style={styles.offerImage} resizeMode="cover" />
                          ) : (
                            <Text style={[styles.offerImageText, isUser && styles.offerCardOutgoingText]}>{message.offerData?.image || '🎁'}</Text>
                          )}
                        </View>
                        <View style={styles.offerDetails}>
                          <View style={styles.offerMetaRow}>
                            <View style={[styles.offerBadge, isUser ? styles.offerBadgeOutgoing : styles.offerBadgeGrey]}>
                              <Text style={[styles.offerBadgeText, isUser ? styles.offerBadgeTextOutgoing : styles.offerBadgeTextGrey]}>
                                {isUser ? 'Sent by You' : 'From Creator'}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.offerTitle, isUser && styles.offerCardOutgoingText]}>{message.offerData?.title || 'Custom Offer'}</Text>
                          <Text style={[styles.offerBudget, isUser && styles.offerCardOutgoingTextSecondary]}>Budget: {message.offerData?.budget || 'N/A'}</Text>
                          {message.offerData?.description && (
                            <Text style={[styles.offerDescription, isUser && styles.offerCardOutgoingTextSecondary]} numberOfLines={2}>{message.offerData.description}</Text>
                          )}
                          <View style={styles.viewOfferLink}>
                            <Text style={[styles.viewOfferLinkText, isUser && styles.offerCardOutgoingText]}>View Details</Text>
                            <MaterialIcons name="chevron-right" size={16} color={isUser ? '#ffffff' : '#337DEB'} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    )}

                    {message.isProposal && (
                      <TouchableOpacity
                        style={[styles.offerCard, isUser && styles.offerCardOutgoing]}
                        onPress={() => navigation?.navigate('CreatorProfile', { userId: message.proposalData?.creatorId })}
                      >
                        <View style={[styles.offerImageContainer, isUser && styles.offerCardOutgoingInner]}>
                          {message.proposalData?.creatorAvatar ? (
                            <Image source={{ uri: message.proposalData.creatorAvatar }} style={styles.offerImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.offerImage, { backgroundColor: isUser ? 'rgba(255,255,255,0.3)' : '#337DEB', justifyContent: 'center', alignItems: 'center' }]}>
                              <Text style={{ color: '#fff', fontSize: 20 }}>{(message.proposalData?.creatorName || 'C').substring(0, 1).toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.offerDetails}>
                          <Text style={[styles.offerTitle, isUser && styles.offerCardOutgoingText]}>{message.proposalData?.creatorName || 'Creator'}'s Portfolio</Text>
                          <Text style={[styles.offerDescription, isUser && styles.offerCardOutgoingTextSecondary]} numberOfLines={2}>Hi! I'm interested in working with you. View my professional profile and past works.</Text>
                          <View style={styles.viewOfferLink}>
                            <Text style={[styles.viewOfferLinkText, isUser && styles.offerCardOutgoingText]}>View Portfolio</Text>
                            <MaterialIcons name="chevron-right" size={16} color={isUser ? '#ffffff' : '#337DEB'} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    )}

                    {message.isFile && (
                      <View style={[
                        styles.messageBubble,
                        isUser ? styles.userMessage : styles.senderMessage,
                        styles.fileMessage
                      ]}>
                        {message.fileType === 'image' && message.fileUrl ? (
                          <View style={styles.imageMessageContainer}>
                            <Image
                              source={{ uri: message.fileUrl }}
                              style={styles.messageImage}
                              resizeMode="cover"
                            />
                            <Text style={[styles.messageTime, isUser ? styles.userMessageTime : styles.senderMessageTime]}>
                              {getCurrentTime(message.createdAt)}
                            </Text>
                          </View>
                        ) : (
                          <View>
                            <View style={styles.fileContainer}>
                              <MaterialIcons name="attach-file" size={20} color="#337DEB" />
                              <View style={styles.fileInfo}>
                                <Text style={styles.fileName}>{message.fileName || 'File'}</Text>
                                <Text style={styles.fileSize}>
                                  {message.fileSize ? `${(message.fileSize / 1024).toFixed(1)} KB` : 'Unknown size'}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.messageTime, isUser ? styles.userMessageTime : styles.senderMessageTime]}>
                              {getCurrentTime(message.createdAt)}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!message.isFile && !message.isOffer && !message.isProposal && message.text ? (
                      <View style={[
                        styles.messageBubble,
                        isUser ? styles.userMessage : styles.senderMessage,
                        message.isOffer && { marginTop: 8 }
                      ]}>
                        <Text style={[
                          styles.messageText,
                          isUser ? styles.userMessageText : styles.senderMessageText
                        ]}>
                          {message.text}
                        </Text>
                        <Text style={[
                          styles.messageTime,
                          isUser ? styles.userMessageTime : styles.senderMessageTime
                        ]}>
                          {getCurrentTime(message.createdAt)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Message Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachmentButton} onPress={handleFileAttachment}>
          <MaterialIcons name="attach-file" size={24} color="#6b7280" />
        </TouchableOpacity>

        <TextInput
          style={styles.messageInput}
          placeholder="Type a message..."
          placeholderTextColor="#9ca3af"
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendButton, !messageText.trim() && { backgroundColor: '#cbd5e1' }]}
          onPress={handleSendMessage}
          disabled={!messageText.trim()}
        >
          <MaterialIcons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <Modal visible={showAttachModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowAttachModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 16, color: '#2d3748' }}>Attach File</Text>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }} onPress={() => { setShowAttachModal(false); handleImagePick('gallery'); }}>
              <Text style={{ fontSize: 16, color: '#337DEB' }}>Photo from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }} onPress={() => { setShowAttachModal(false); handleImagePick('camera'); }}>
              <Text style={{ fontSize: 16, color: '#337DEB' }}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }} onPress={handleDocumentPick}>
              <Text style={{ fontSize: 16, color: '#337DEB' }}>Document</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, marginTop: 8 }} onPress={() => setShowAttachModal(false)}>
              <Text style={{ fontSize: 16, color: '#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showClearChatModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowClearChatModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#2d3748' }}>Clear Chat</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>Are you sure you want to clear this chat history? This cannot be undone.</Text>
            <TouchableOpacity style={{ paddingVertical: 14, backgroundColor: '#ef4444', borderRadius: 8, alignItems: 'center', marginBottom: 8 }} onPress={async () => {
              setShowClearChatModal(false);
              try {
                setLoading(true);
                await clearMessages(currentConversation.id);
                setMessages([]);
                showToast('Chat history has been cleared.', 'success');
              } catch (err) {
                showToast('Failed to clear chat.', 'error');
              } finally {
                setLoading(false);
              }
            }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, alignItems: 'center' }} onPress={() => setShowClearChatModal(false)}>
              <Text style={{ fontSize: 16, color: '#6b7280' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  profileSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  profileImageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#337DEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImageText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  profileImageEmoji: {
    fontSize: 20,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileInfo: {
    marginLeft: 12,
  },
  profileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
  },
  profileTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  moreButton: {
    padding: 8,
  },
  chatArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateText: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 12,
    color: '#6b7280',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 20,
    fontSize: 14,
  },
  messageContainer: {
    marginBottom: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userMessage: {
    backgroundColor: '#337DEB',
    alignSelf: 'flex-end',
  },
  senderMessage: {
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#ffffff',
  },
  senderMessageText: {
    color: '#2d3748',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  userMessageTime: {
    color: '#ffffff',
    opacity: 0.8,
  },
  senderMessageTime: {
    color: '#6b7280',
  },
  offerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  offerCardOutgoing: {
    backgroundColor: '#337DEB',
    borderColor: '#337DEB',
    alignSelf: 'flex-end',
  },
  offerCardOutgoingInner: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  offerCardOutgoingText: {
    color: '#ffffff',
  },
  offerCardOutgoingTextSecondary: {
    color: 'rgba(255,255,255,0.9)',
  },
  offerBadgeOutgoing: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  offerBadgeTextOutgoing: {
    color: '#ffffff',
  },
  offerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  offerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerBadgeBlue: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  offerBadgeGrey: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  offerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  offerBadgeTextBlue: {
    color: '#1d4ed8',
  },
  offerBadgeTextGrey: {
    color: '#6b7280',
  },
  offerImageContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  offerImageText: {
    fontSize: 24,
  },
  offerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  offerDetails: {
    minWidth: 0,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 4,
  },
  offerBudget: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  offerDescription: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 18,
    marginBottom: 8,
  },
  viewOfferLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewOfferLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#337DEB',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  attachmentButton: {
    padding: 8,
    marginRight: 8,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#337DEB',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileMessage: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#337DEB',
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileInfo: {
    marginLeft: 8,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
  },
  fileSize: {
    fontSize: 12,
    color: '#337DEB',
    marginTop: 2,
  },
  imageMessageContainer: {
    width: '100%',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
});

export default Messages;
