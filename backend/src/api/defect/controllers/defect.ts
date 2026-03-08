import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::defect.defect', ({ strapi }) => ({
    async create(ctx) {
        try {
            // 1. Get the payload sent from the frontend
            const { data } = ctx.request.body as any;

            const {
                pieceId,
                batch,
                type,
                severity,
                description,
                locationX,
                locationY,
                image,
                ai_confidence,
                aiConfidence,  // frontend may send either name
                status,
            } = data;

            // Resolve AI confidence from either field name
            const resolvedAiConfidence = ai_confidence ?? aiConfidence ?? null;

            // 2. Find or create the piece based on the pieceId (SKU)
            let pieceEntity: any = null;
            let isNewPiece = false;

            if (pieceId) {
                // Try to find the piece
                const existingPieces = await strapi.entityService.findMany('api::piece.piece', {
                    filters: { sku: pieceId },
                    limit: 1,
                });

                if (existingPieces && Array.isArray(existingPieces) && existingPieces.length > 0) {
                    pieceEntity = existingPieces[0];
                } else {
                    // Create new piece
                    isNewPiece = true;

                    const pieceData: any = {
                        sku: pieceId,
                        publishedAt: new Date(),
                    };
                    if (batch) {
                        pieceData.batch = batch;
                    }

                    pieceEntity = await strapi.entityService.create('api::piece.piece', {
                        data: pieceData,
                    });
                }
            }

            // 3. Derive quality_status from severity and persist it immediately on the piece
            const qualityStatus =
                severity === 'Critical' || severity === 'High' ? 'Rechazado' :
                    severity === 'Medium' ? 'En Revisión' : 'En Revisión';

            if (pieceEntity) {
                try {
                    await strapi.entityService.update('api::piece.piece', pieceEntity.id, {
                        data: { quality_status: qualityStatus } as any,
                    });
                } catch (qErr) {
                    console.warn('[Defect] Could not update piece quality_status:', qErr);
                }
            }

            // 4. Update the batch count if a new piece was created
            if (isNewPiece && batch) {
                let batchEntity: any = null;

                try {
                    if (isNaN(Number(batch))) {
                        // It's a documentId
                        const results = await strapi.entityService.findMany('api::batch.batch', {
                            filters: { documentId: batch },
                            limit: 1
                        });
                        if (results && results.length > 0) {
                            batchEntity = results[0];
                        }
                    } else {
                        // It's a numeric ID
                        batchEntity = await strapi.entityService.findOne('api::batch.batch', batch);
                    }

                    if (batchEntity) {
                        await strapi.entityService.update('api::batch.batch', batchEntity.id, {
                            data: {
                                piece_count: (batchEntity.piece_count || 0) + 1,
                            } as any,
                        });
                    }
                } catch (bErr) {
                    console.warn('[Defect] Could not update batch piece_count:', bErr);
                }
            }

            // 5. Create the defect mapped to the schema
            const newDefectData = {
                defect_type: type,
                severity: severity,
                description: description,
                location_x: parseFloat(locationX) || 0,
                location_y: parseFloat(locationY) || 0,
                aiConfidence: resolvedAiConfidence !== undefined && resolvedAiConfidence !== null ? String(resolvedAiConfidence) : null,
                stat: 'not reviewed',
                // Associate the uploaded image (it's passed as an ID from the frontend)
                image: image ? [image.toString()] : null,
                // Link to the piece
                pieces: pieceEntity ? [pieceEntity.id] : [],
                publishedAt: new Date(),
            };

            // Replace the body data directly on the Koa context
            ctx.request.body = { data: newDefectData };

            // Call the default core action
            // @ts-ignore
            const response = await super.create(ctx);

            return response;
        } catch (err: any) {
            console.error('DEFECT CREATION ERROR:', err);
            // @ts-ignore
            ctx.body = err;
            return ctx.badRequest('Error: ' + (err.message || JSON.stringify(err)));
        }
    },
}));
