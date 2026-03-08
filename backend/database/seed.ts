/**
 * Seed script to populate database with test data
 * Run with: npm run strapi seed
 */

export async function seed(strapi: any) {
  console.log('🌱 Starting database seed...');

  try {
    // 1. Create Materials
    console.log('📦 Creating materials...');
    const materials = await Promise.all([
      strapi.entityService.create('api::material.material', {
        data: {
          name: 'Silestone Blanco Zeus',
          code: 'SIL-BZ-001',
          type: 'Silestone',
          description: 'Cuarzo compacto de color blanco con vetas grises',
          publishedAt: new Date(),
        },
      }),
      strapi.entityService.create('api::material.material', {
        data: {
          name: 'Dekton Aura',
          code: 'DEK-AU-002',
          type: 'Dekton',
          description: 'Superficie ultracompacta con acabado mármol',
          publishedAt: new Date(),
        },
      }),
      strapi.entityService.create('api::material.material', {
        data: {
          name: 'Sensa Black Beauty',
          code: 'SEN-BB-003',
          type: 'Sensa',
          description: 'Granito natural sellado con protección permanente',
          publishedAt: new Date(),
        },
      }),
    ]);
    console.log(`✅ Created ${materials.length} materials`);

    // 2. Create Production Line
    console.log('🏭 Creating production line...');
    const productionLine = await strapi.entityService.create('api::production-line.production-line', {
      data: {
        name: 'Línea Principal A',
        code: 'LP-A-001',
        status: 'active',
        publishedAt: new Date(),
      },
    });
    console.log('✅ Created production line');

    // 3. Create Batches
    console.log('📊 Creating batches...');
    const today = new Date();
    const batches = [];

    for (let i = 0; i < 5; i++) {
      const batchDate = new Date(today);
      batchDate.setDate(today.getDate() - i);
      
      const totalPieces = Math.floor(Math.random() * 50) + 200;
      const rejectedPieces = Math.floor(Math.random() * 10) + 5;
      const approvedPieces = totalPieces - rejectedPieces;

      const batch = await strapi.entityService.create('api::batch.batch', {
        data: {
          batch_id: `LOT-${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${(100 + i).toString()}`,
          material: materials[i % materials.length].id,
          production_line: productionLine.id,
          date_created: batchDate,
          ai_status: ['Homogéneo', 'Alerta de Tono', 'Pendiente'][i % 3],
          status: ['Approved', 'Pending Review', 'Flagged'][i % 3],
          total_pieces: totalPieces,
          approved_pieces: approvedPieces,
          rejected_pieces: rejectedPieces,
          publishedAt: new Date(),
        },
      });
      batches.push(batch);
    }
    console.log(`✅ Created ${batches.length} batches`);

    // 4. Create Pieces
    console.log('🔲 Creating pieces...');
    const pieces = [];
    
    for (const batch of batches.slice(0, 2)) {
      for (let i = 0; i < 10; i++) {
        const isRejected = i > 7; // Last 2 pieces are rejected
        const piece = await strapi.entityService.create('api::piece.piece', {
          data: {
            piece_id: `${batch.batch_id}-P${(i + 1).toString().padStart(4, '0')}`,
            batch: batch.id,
            dimensions_length: 3000,
            dimensions_width: 1400,
            dimensions_thickness: 20,
            weight: 120.5 + Math.random() * 10,
            status: isRejected ? 'Rejected' : 'Approved',
            ai_analysis: {
              brightness: Math.random() * 100,
              tone_uniformity: Math.random() * 100,
              defect_count: isRejected ? Math.floor(Math.random() * 3) + 1 : 0,
            },
            capture_datetime: new Date(),
            publishedAt: new Date(),
          },
        });
        pieces.push(piece);
      }
    }
    console.log(`✅ Created ${pieces.length} pieces`);

    // 5. Create Defects
    console.log('⚠️ Creating defects...');
    const defectTypes = [
      'Surface Fissure',
      'Micro-crack',
      'Color Variation',
      'Brightness Issue',
      'Texture Irregularity'
    ];
    const severities = ['Low', 'Medium', 'High', 'Critical'];
    const statuses = ['Open', 'Under Review', 'Resolved'];

    const defects = [];
    const rejectedPieces = pieces.filter(p => p.status === 'Rejected');

    for (const piece of rejectedPieces) {
      const numDefects = Math.floor(Math.random() * 2) + 1;
      
      for (let i = 0; i < numDefects; i++) {
        const defect = await strapi.entityService.create('api::defect.defect', {
          data: {
            piece: piece.id,
            defect_type: defectTypes[Math.floor(Math.random() * defectTypes.length)],
            severity: severities[Math.floor(Math.random() * severities.length)],
            location_x: Math.floor(Math.random() * 100),
            location_y: Math.floor(Math.random() * 100),
            description: 'Defecto detectado durante inspección automatizada',
            ai_detection: true,
            ai_confidence: 85 + Math.random() * 15,
            ai_suggestion: 'Revisar manualmente para confirmar clasificación',
            detected_at: new Date(),
            inspector_id: `OP-${Math.floor(Math.random() * 50) + 1}`,
            status: statuses[Math.floor(Math.random() * statuses.length)],
            publishedAt: new Date(),
          },
        });
        defects.push(defect);
      }
    }
    console.log(`✅ Created ${defects.length} defects`);

    // Summary
    console.log('\n🎉 Database seeding completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Materials: ${materials.length}`);
    console.log(`   - Batches: ${batches.length}`);
    console.log(`   - Pieces: ${pieces.length}`);
    console.log(`   - Defects: ${defects.length}`);
    console.log('\n✨ You can now test the dashboard with real data!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

export default seed;
