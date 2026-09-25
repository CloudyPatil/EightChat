import { Request, Response } from 'express';
import { isConversationMember } from '../services/messages.service';
import { uploadImageBuffer } from '../config/cloudinary';
import { validateImageSignature } from '../utils/fileValidation';

export class UploadsController {
  static async uploadImage(req: Request, res: Response): Promise<void> {
    const conversationId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
    if (!(await isConversationMember(conversationId, req.user!.userId))) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    if (!validateImageSignature(req.file.buffer)) {
      res.status(400).json({ success: false, error: 'Invalid file signature' });
      return;
    }

    try {
      const imageUrl = await uploadImageBuffer(req.file.buffer, `eightchat/${conversationId}`);
      res.status(201).json({
        success: true,
        image_url: imageUrl,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  }
}
