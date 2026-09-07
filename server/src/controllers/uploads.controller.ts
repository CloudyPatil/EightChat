import path from 'path';
import { Request, Response } from 'express';
import { isConversationMember } from '../services/messages.service';

export class UploadsController {
  static async uploadImage(req: Request, res: Response): Promise<void> {
    const conversationId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
    if (!(await isConversationMember(conversationId, req.user!.userId))) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, error: 'Image file is required' });
      return;
    }

    res.status(201).json({
      success: true,
      image_url: `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.filename)}`,
    });
  }
}
