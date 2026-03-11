# Upload API Quick Reference

## Service File
📁 `services/upload.js`

## Available Functions

| Function | Purpose | Max Files | Max Size |
|----------|---------|-----------|----------|
| `uploadImage(file)` | Upload single image | 1 | 10MB |
| `uploadImages(files[])` | Upload multiple images | 10 | 10MB each |
| `uploadDocument(file)` | Upload single document | 1 | 20MB |
| `uploadDocuments(files[])` | Upload multiple documents | 10 | 20MB each |
| `deleteFile(publicId, type)` | Delete uploaded file | - | - |
| `extractPublicId(url)` | Extract Cloudinary public ID from URL | - | - |

## Where to Use

### ✅ High Priority (Currently Missing)

1. **Profile Picture Upload**
   - 📍 `components/EditProfile.js` (line ~109)
   - 🔧 Replace mock image picker with real upload

2. **Banner Image Upload**
   - 📍 `components/EditProfile.js` (line ~88-89)
   - 🔧 Add banner image upload functionality

3. **Offer Media Upload**
   - 📍 `components/CreateOffer.js` (line ~60-69)
   - 📍 `components/EditOffer.js` (line ~357-372)
   - 🔧 Replace "coming soon" with actual upload

4. **Portfolio Image Upload**
   - 📍 `components/CreatorDetailsSetup.js` (line ~156-189)
   - 🔧 Replace mock images with real upload

5. **Message File Attachments**
   - 📍 `components/Messages.js` (line ~118-121)
   - 🔧 Implement file attachment feature

### ⚠️ Medium Priority (Enhancement)

6. **Portfolio Item Deletion**
   - 📍 `components/CreatorProfile.js` (line ~445-481)
   - 🔧 Add Cloudinary file deletion when deleting portfolio items

7. **Offer Media Deletion**
   - 📍 `components/OfferDetails.js` (line ~294-317)
   - 🔧 Delete media files from Cloudinary when deleting offers

8. **Order Deliverables Upload**
   - 📍 `components/OrderDetails.js` (line ~227-291)
   - 🔧 Add file upload option instead of manual URL entry

## Quick Usage Example

```javascript
import { uploadImage } from '../services/upload';

// Upload image
const result = await uploadImage({
  uri: imageUri,
  type: 'image/jpeg',
  name: 'photo.jpg'
});

const imageUrl = result.data.url; // Use this URL
```

## Delete Example

```javascript
import { deleteFile, extractPublicId } from '../services/upload';

// Extract public ID from URL
const publicId = extractPublicId(fileUrl);

// Delete file
await deleteFile(publicId, 'image'); // or 'raw' for documents
```

## Full Documentation

See `docs/UPLOAD_API_USAGE.md` for detailed implementation examples.


