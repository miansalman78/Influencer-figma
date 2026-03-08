# Upload API Usage Documentation

This document outlines where and how to use the Upload & Delete APIs from the Postman collection in the React Native application.

## Available APIs

Based on `API/Upload & OAuth APIs.postman_collection.json`:

1. **Upload Single Image** - `POST /api/upload/image`
2. **Upload Multiple Images** - `POST /api/upload/images` (max 10)
3. **Upload Single Document** - `POST /api/upload/document`
4. **Upload Multiple Documents** - `POST /api/upload/documents` (max 10)
5. **Delete File** - `DELETE /api/upload/file/:publicId`

## Service Location

The upload service is implemented in: `services/upload.js`

## Usage Examples

### Basic Image Upload

```javascript
import { uploadImage } from '../services/upload';

// After selecting image from camera/gallery
const handleImageUpload = async (imageUri) => {
  try {
    const result = await uploadImage({
      uri: imageUri,
      type: 'image/jpeg',
      name: 'profile.jpg'
    });
    
    const imageUrl = result.data.url;
    // Use imageUrl in your component
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

### Basic Document Upload

```javascript
import { uploadDocument } from '../services/upload';

const handleDocumentUpload = async (documentUri) => {
  try {
    const result = await uploadDocument({
      uri: documentUri,
      type: 'application/pdf',
      name: 'contract.pdf'
    });
    
    const documentUrl = result.data.url;
    // Use documentUrl in your component
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

### Delete File

```javascript
import { deleteFile, extractPublicId } from '../services/upload';

const handleDeleteFile = async (fileUrl) => {
  try {
    // Extract public ID from Cloudinary URL
    const publicId = extractPublicId(fileUrl);
    
    if (publicId) {
      // Determine resource type (image or raw for documents)
      const resourceType = fileUrl.includes('/documents/') ? 'raw' : 'image';
      await deleteFile(publicId, resourceType);
      console.log('File deleted successfully');
    }
  } catch (error) {
    console.error('Delete failed:', error);
  }
};
```

## Where to Use These APIs

### 1. Profile Picture Upload

**Location:** `components/EditProfile.js` (line ~109-116)

**Current State:** Uses placeholder/mock image picker

**Implementation:**
```javascript
import { uploadImage } from '../services/upload';
import * as ImagePicker from 'expo-image-picker';

const handleImagePicker = async () => {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions');
      return;
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const image = result.assets[0];
      
      // Upload to Cloudinary
      const uploadResult = await uploadImage({
        uri: image.uri,
        type: 'image/jpeg',
        name: 'profile.jpg'
      });

      // Update profile image state
      setProfileImage(uploadResult.data.url);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to upload image');
  }
};
```

### 2. Banner Image Upload

**Location:** `components/EditProfile.js` (line ~88-89)

**Implementation:** Similar to profile picture, but for banner image

### 3. Offer Media Upload

**Location:** `components/CreateOffer.js` (line ~60-69) and `components/EditOffer.js` (line ~357-372)

**Current State:** Shows "coming soon" alert

**Implementation:**
```javascript
import { uploadImage, uploadImages } from '../services/upload';
import * as ImagePicker from 'expo-image-picker';

const handleMediaUpload = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.fileName || 'image.jpg'
      }));

      // Upload single or multiple images
      const uploadResult = result.assets.length === 1
        ? await uploadImage(files[0])
        : await uploadImages(files);

      // Store URLs in offer data
      const mediaUrls = result.assets.length === 1
        ? [uploadResult.data.url]
        : uploadResult.data.urls;

      setSelectedMedia(mediaUrls);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to upload media');
  }
};
```

### 4. Portfolio Image Upload

**Location:** `components/CreatorDetailsSetup.js` (line ~156-189)

**Current State:** Uses mock/placeholder images

**Implementation:**
```javascript
import { uploadImage, uploadImages } from '../services/upload';

const handleUploadPortfolio = async () => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const files = result.assets.map(asset => ({
        uri: asset.uri,
        type: 'image/jpeg',
        name: asset.fileName || 'portfolio.jpg'
      }));

      const uploadResult = await uploadImages(files);
      const portfolioUrls = uploadResult.data.urls || [uploadResult.data.url];
      
      setPortfolio(prev => [...prev, ...portfolioUrls]);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to upload portfolio images');
  }
};
```

### 5. Portfolio Item Deletion

**Location:** `components/CreatorProfile.js` (line ~445-481)

**Current State:** Deletes from database but not from Cloudinary

**Enhancement:**
```javascript
import { deleteFile, extractPublicId } from '../services/upload';

const handleDeletePortfolio = async (item) => {
  Alert.alert(
    'Delete Portfolio Item',
    'Are you sure you want to delete this portfolio item?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Delete from Cloudinary if URL exists
            if (item.url || item.imageUrl) {
              const publicId = extractPublicId(item.url || item.imageUrl);
              if (publicId) {
                await deleteFile(publicId, 'image');
              }
            }

            // Delete from database
            const portfolioService = await import('../services/portfolio');
            await portfolioService.deletePortfolio(item._id || item.id);
            
            Alert.alert('Success', 'Portfolio item deleted successfully');
            // Refresh portfolio
          } catch (error) {
            Alert.alert('Error', 'Failed to delete portfolio item');
          }
        },
      },
    ]
  );
};
```

### 6. Offer Media Deletion

**Location:** `components/OfferDetails.js` (line ~294-317) and `components/EditOffer.js`

**Enhancement:** When deleting an offer, also delete associated media files

```javascript
import { deleteFile, extractPublicId } from '../services/upload';

const handleDeleteOffer = async () => {
  Alert.alert('Delete Offer', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        try {
          const offer = mappedOffer?._original || offer;
          
          // Delete media files from Cloudinary
          if (offer.media && Array.isArray(offer.media)) {
            for (const media of offer.media) {
              if (media.url) {
                const publicId = extractPublicId(media.url);
                if (publicId) {
                  await deleteFile(publicId, 'image');
                }
              }
            }
          }

          // Delete offer from database
          const offersService = await import('../services/offers');
          await offersService.deleteOffer(offer._id || offer.id);
          
          Alert.alert('Success', 'Offer deleted successfully');
          navigation?.goBack();
        } catch (error) {
          Alert.alert('Error', 'Failed to delete offer');
        }
      }
    }
  ]);
};
```

### 7. Message File Attachments

**Location:** `components/Messages.js` (line ~118-121)

**Current State:** Shows "Coming Soon" alert

**Implementation:**
```javascript
import { uploadImage, uploadDocument } from '../services/upload';
import * as DocumentPicker from 'expo-document-picker';

const handleFileAttachment = async () => {
  Alert.alert(
    'Attach File',
    'Choose file type',
    [
      {
        text: 'Image',
        onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              const uploadResult = await uploadImage({
                uri: result.assets[0].uri,
                type: 'image/jpeg',
                name: 'attachment.jpg'
              });

              // Send message with file URL
              await sendMessage(conversationId, {
                text: '',
                attachment: uploadResult.data.url,
                attachmentType: 'image'
              });
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to upload image');
          }
        }
      },
      {
        text: 'Document',
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            });

            if (!result.canceled && result.assets[0]) {
              const uploadResult = await uploadDocument({
                uri: result.assets[0].uri,
                type: result.assets[0].mimeType,
                name: result.assets[0].name
              });

              // Send message with document URL
              await sendMessage(conversationId, {
                text: '',
                attachment: uploadResult.data.url,
                attachmentType: 'document'
              });
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to upload document');
          }
        }
      },
      { text: 'Cancel', style: 'cancel' }
    ]
  );
};
```

### 8. Order Deliverables Upload

**Location:** `components/OrderDetails.js` (line ~227-291)

**Current State:** Accepts URLs manually

**Enhancement:** Add file upload option for deliverables

```javascript
import { uploadImage, uploadDocument } from '../services/upload';

const handleUploadDeliverable = async (deliverableIndex) => {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isImage = asset.type === 'image';
      
      const uploadResult = isImage
        ? await uploadImage({
            uri: asset.uri,
            type: asset.type,
            name: asset.fileName || 'deliverable.jpg'
          })
        : await uploadDocument({
            uri: asset.uri,
            type: asset.type,
            name: asset.fileName || 'deliverable.pdf'
          });

      // Update deliverable URL
      const newUrls = [...deliverableUrls];
      newUrls[deliverableIndex] = uploadResult.data.url;
      setDeliverableUrls(newUrls);
    }
  } catch (error) {
    Alert.alert('Error', 'Failed to upload deliverable');
  }
};
```

## File Size Limits

- **Images:** Max 10MB per file
- **Documents:** Max 20MB per file
- **Multiple files:** Max 10 files per request

## Supported Formats

### Images
- JPEG
- PNG
- GIF
- WebP

### Documents
- PDF
- DOC, DOCX
- TXT
- XLS, XLSX
- PPT, PPTX

## Required Dependencies

Make sure these packages are installed:

```bash
npm install expo-image-picker expo-document-picker
```

For React Native (non-Expo), use:
- `react-native-image-picker` for image selection
- `react-native-document-picker` for document selection

## Error Handling

All upload functions throw errors that should be caught:

```javascript
try {
  const result = await uploadImage(file);
  // Success
} catch (error) {
  // Handle error
  if (error.message.includes('size')) {
    Alert.alert('Error', 'File is too large. Max size: 10MB');
  } else if (error.message.includes('format')) {
    Alert.alert('Error', 'File format not supported');
  } else {
    Alert.alert('Error', 'Upload failed. Please try again.');
  }
}
```

## Notes

1. **Authentication:** All upload endpoints require JWT token (automatically handled by `apiClient`)
2. **Public ID:** When deleting files, extract the public ID from the Cloudinary URL using `extractPublicId()`
3. **Resource Type:** Use `'image'` for images and `'raw'` for documents when deleting
4. **File URIs:** React Native file URIs use `file://` or `content://` protocols
5. **FormData:** The service automatically handles FormData creation for multipart uploads


