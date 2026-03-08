import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) { },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const materialsToInsert: any[] = [
      {
        name: "Dekton Estándar",
        code: "MAT-DK-01",
        type: "Dekton",
        description: "Superficie ultracompacta. Material principal referenciado en el catálogo de defectos (IE-17-86) con inspección visual a 70cm y ángulo de 45º."
      },
      {
        name: "Silestone",
        code: "MAT-SIL-01",
        type: "Silestone",
        description: "Superficie mineral híbrida. Incluido bajo las especificaciones corporativas del documento SGI Cosentino."
      },
      {
        name: "Sensa",
        code: "MAT-SEN-01",
        type: "Sensa",
        description: "Piedra natural con protección exclusiva. Incluido bajo las especificaciones corporativas del documento SGI Cosentino."
      }
    ];

    try {
      for (const material of materialsToInsert) {
        const existing = await strapi.documents('api::material.material').findMany({
          filters: { code: material.code },
        });

        if (!existing || existing.length === 0) {
          strapi.log.info(`Inserting ${material.name}...`);
          await strapi.documents('api::material.material').create({
            data: material,
            status: 'published'
          });
        }
      }
    } catch (e) {
      strapi.log.error('Failed to seed materials', e);
    }
  },
};
