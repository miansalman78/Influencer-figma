import { db } from './firebase';
import firestore from '@react-native-firebase/firestore';
import apiClient from './apiClient';

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_COLLECTION = 'messages';

/**
 * Send a message in a conversation
 * @param {string} conversationId 
 * @param {object} messageData 
 * @param {string} senderId 
 * @param {string} senderRole 
 */
export const sendMessage = async (conversationId, messageData, senderId, senderRole) => {
    try {
        const timestamp = firestore.FieldValue.serverTimestamp();

        // 1. Get conversation to find recipientId
        const convDoc = await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).get();
        if (!convDoc.exists) {
            console.error(`[ChatService] Conversation ${conversationId} not found in Firestore`);
            throw new Error('Conversation not found');
        }

        const convData = convDoc.data();
        const normalizedSenderRole = senderRole?.toLowerCase();
        // Recipient is the other party: if sender is brand, recipient is influencer. If sender is influencer/creator, recipient is brand.
        const recipientId = (normalizedSenderRole === 'brand') ? convData.influencerId : convData.brandId;

        console.log(`[ChatService] Sending message in ${conversationId}. Sender: ${senderId} (${senderRole}), Recipient: ${recipientId}`);

        // 2. Add message to messages subcollection
        const msgRef = await db.collection(CONVERSATIONS_COLLECTION)
            .doc(conversationId)
            .collection(MESSAGES_COLLECTION)
            .add({
                ...messageData,
                senderId,
                senderRole: normalizedSenderRole,
                timestamp,
                isRead: false,
            });

        console.log(`[ChatService] message added with ID: ${msgRef.id}`);

        // 3. Update conversation last message and unread count
        const roleToIncrement = (normalizedSenderRole === 'brand') ? 'influencer' : 'brand';
        await db.collection(CONVERSATIONS_COLLECTION)
            .doc(conversationId)
            .update({
                lastMessage: messageData.isOffer
                    ? `🎁 ${messageData.offerData?.title || 'Sent an offer'}`
                    : messageData.isProposal
                        ? `📋 ${messageData.proposalData?.creatorName || 'Creator'} sent a proposal`
                        : messageData.text || (messageData.isFile ? '📎 File attached' : 'Message'),

                lastMessageTime: timestamp,
                lastMessageSenderId: senderId,
                [`unreadCount.${roleToIncrement}`]: firestore.FieldValue.increment(1),
            });

        console.log(`[ChatService] Conversation unread count incremented for: ${roleToIncrement}`);

        // 4. Trigger backend notification (best effort - don't fail message if notification fails)
        try {
            await apiClient.post('/messages/notify', {
                recipientId,
                messageText: messageData.text || (messageData.isFile ? '📎 File attached' : 'New Message'),
                conversationId
            });
        } catch (notifErr) {
            console.warn('[ChatService] Failed to send notification:', notifErr.message);
        }

        return true;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
};

/**
 * Subscribe to messages in a conversation
 * @param {string} conversationId 
 * @param {function} callback 
 * @returns {function} unsubscribe function
 */
export const subscribeToMessages = (conversationId, callback) => {
    return db.collection(CONVERSATIONS_COLLECTION)
        .doc(conversationId)
        .collection(MESSAGES_COLLECTION)
        .orderBy('timestamp', 'asc')
        .onSnapshot(
            (snapshot) => {
                const messages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    // Convert timestamp to Date object if it exists
                    createdAt: doc.data().timestamp?.toDate(),
                }));
                callback(messages);
            },
            (error) => {
                console.error('Error subscribing to messages:', error);
            }
        );
};

/**
 * Get a conversation by its ID
 * @param {string} conversationId
 * @returns {Promise<{id: string, brandId: string, influencerId: string, brandName?: string, influencerName?: string, brandAvatar?: string, influencerAvatar?: string} | null>}
 */
export const getConversationById = async (conversationId) => {
    try {
        const doc = await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error('Error fetching conversation by id:', error);
        return null;
    }
};

/**
 * Get (or create) a conversation between a brand and an influencer
 * @param {string} brandId 
 * @param {string} influencerId 
 * @param {object} initialData - Optional data like names and avatars
 */
export const getOrCreateConversation = async (brandId, influencerId, initialData = {}) => {
    try {
        // Check if conversation exists
        // We construct ID deterministically to avoid querying
        // ID format: brandId_influencerId
        // Note: In a real app, you might want to query by participants array

        // Simple deterministic ID for now
        // Ensure IDs are valid key strings
        if (!brandId || !influencerId) throw new Error('Brand ID and Influencer ID are required');

        // Using a query to find existing conversation or create new one
        const querySnapshot = await db.collection(CONVERSATIONS_COLLECTION)
            .where('brandId', '==', brandId)
            .where('influencerId', '==', influencerId)
            .limit(1)
            .get();

        if (!querySnapshot.empty) {
            return { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
        }

        // Create new conversation
        const conversationData = {
            brandId,
            influencerId,
            brandName: initialData.brandName || 'Brand',
            influencerName: initialData.influencerName || 'Creator',
            brandAvatar: initialData.brandAvatar || '',
            influencerAvatar: initialData.influencerAvatar || '',
            createdAt: firestore.FieldValue.serverTimestamp(),
            updatedAt: firestore.FieldValue.serverTimestamp(),
            unreadCount: {
                brand: 0,
                influencer: 0
            },
            lastMessage: 'Started a conversation',
            lastMessageTime: firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection(CONVERSATIONS_COLLECTION).add(conversationData);
        return { id: docRef.id, ...conversationData };
    } catch (error) {
        console.error('Error getting/creating conversation:', error);
        throw error;
    }
};

/**
 * Subscribe to list of conversations for a user
 * @param {string} userId
 * @param {string} role - 'brand' or 'influencer'
 * @param {function} callback - (conversations) => void
 * @param {function} [onError] - optional, called on Firestore error (e.g. no conversations / permission)
 */
export const subscribeToConversations = (userId, role, callback, onError) => {
    const normalizedRole = role?.toLowerCase();
    const queryField = (normalizedRole === 'brand') ? 'brandId' : 'influencerId';

    // Query with only where() so no composite index is required (orderBy would need an index)
    return db.collection(CONVERSATIONS_COLLECTION)
        .where(queryField, '==', userId)
        .onSnapshot(
            (snapshot) => {
                const conversations = snapshot.docs.map(doc => {
                    const data = doc.data();
                    const lastMessageTime = data.lastMessageTime?.toDate ? data.lastMessageTime.toDate() : data.lastMessageTime;
                    return { id: doc.id, ...data, lastMessageTime };
                });
                // Sort by lastMessageTime descending in memory (most recent first)
                conversations.sort((a, b) => {
                    const tA = a.lastMessageTime ? (a.lastMessageTime.getTime ? a.lastMessageTime.getTime() : new Date(a.lastMessageTime).getTime()) : 0;
                    const tB = b.lastMessageTime ? (b.lastMessageTime.getTime ? b.lastMessageTime.getTime() : new Date(b.lastMessageTime).getTime()) : 0;
                    return tB - tA;
                });
                callback(conversations);
            },
            (error) => {
                console.error('Error subscribing to conversations:', error);
                if (typeof onError === 'function') onError(error);
            }
        );
};

/**
 * Mark messages in a conversation as read
 * @param {string} conversationId 
 * @param {string} userRole - 'brand' or 'influencer'
 */
export const markConversationAsRead = async (conversationId, userRole) => {
    try {
        const normalizedRole = userRole?.toLowerCase();
        const roleKey = (normalizedRole === 'brand') ? 'brand' : 'influencer';

        console.log(`[ChatService] Marking ${conversationId} as read for ${normalizedRole} (${roleKey})`);

        // Update unread count for this user to 0
        await db.collection(CONVERSATIONS_COLLECTION)
            .doc(conversationId)
            .update({
                [`unreadCount.${roleKey}`]: 0
            });

        console.log(`[ChatService] Successfully marked ${conversationId} as read`);
    } catch (error) {
        console.error('[ChatService] Error marking conversation as read:', error);
    }
};

/**
 * Subscribe to the total unread count across all conversations for a user
 * @param {string} userId 
 * @param {string} role 
 * @param {function} callback 
 */
export const subscribeToTotalUnreadCount = (userId, role, callback) => {
    const normalizedRoleForQuery = (role?.toLowerCase() === 'brand') ? 'brandId' : 'influencerId';
    const normalizedRoleForCount = (role?.toLowerCase() === 'brand') ? 'brand' : 'influencer';

    return db.collection(CONVERSATIONS_COLLECTION)
        .where(normalizedRoleForQuery, '==', userId)
        .onSnapshot(
            (snapshot) => {
                let total = 0;
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const count = (data.unreadCount?.[normalizedRoleForCount] || 0);
                    total += count;
                });
                console.log(`[ChatService] Total unread for ${role} (${userId}):`, total);
                callback(total);
            },
            (error) => {
                console.error('Error subscribing to total unread count:', error);
            }
        );
};

/**
 * Clear all messages in a conversation
 * @param {string} conversationId 
 */
export const clearMessages = async (conversationId) => {
    try {
        const messagesRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).collection(MESSAGES_COLLECTION);
        const snapshot = await messagesRef.get();

        if (snapshot.empty) return true;

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // Update conversation summary to indicate chat was cleared
        await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).update({
            lastMessage: 'Chat history cleared',
            lastMessageTime: firestore.FieldValue.serverTimestamp(),
            'unreadCount.brand': 0,
            'unreadCount.influencer': 0
        });

        return true;
    } catch (error) {
        console.error('Error clearing messages:', error);
        throw error;
    }
};
