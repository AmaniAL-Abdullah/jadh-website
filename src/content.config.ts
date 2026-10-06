import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const commonFields = {
  title: z.string(),
  description: z.string(),
  meta_title: z.string().optional(),
  date: z.coerce.date().optional(),
  image: z.string().optional(),
  draft: z.boolean(),
};

const aboutCollection = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "src/content/about",
  }),
  schema: z.object({
    ...commonFields,
    content_1: z.string().optional(),
    button: z.object({
      enable: z.boolean(),
      label: z.string(),
      link: z.string(),
    }),
    story: z.object({
      title: z.string(),
      content_1: z.string(),
      content_2: z.string(),
      stats: z.array(
        z.object({
          key: z.string(),
          value: z.string(),
        })
      ),
    }),
    value: z.object({
      title: z.string(),
      content: z.string(),
      values: z.array(
        z.object({
          title: z.string(),
          content: z.string(),
        })
      ),
    }),
    team: z.object({
      title: z.string(),
      content: z.string(),
      members: z.array(
        z.object({
          name: z.string(),
          image: z.string(),
          designation: z.string(),
        })
      ),
    }),
    career: z.object({
      title: z.string(),
      content: z.string(),
    }),
  }),
});

const contactCollection = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "src/content/contact",
  }),
  schema: z.object({
    ...commonFields,
  }),
});

const homeCollection = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "src/content/homepage",
  }),
  schema: z.object({
    banner: z.object({
      title: z.string(),
      content: z.string(),
      image: z.string(),
      button: z.object({
        enable: z.boolean(),
        label: z.string(),
        link: z.string(),
      }),
      brands: z.array(z.string()),
    }),
    service: z.object({
      title: z.string(),
      services: z.array(
        z.object({
          title: z.string(),
          image: z.string(),
          content: z.string(),
          button: z.object({
            enable: z.boolean(),
            label: z.string(),
            link: z.string(),
          }),
        })
      ),
    }),
    feature: z.object({
      title: z.string(),
      content: z.string(),
      features: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          card_content: z.string(),
          icon: z.string(),
          image: z.string(),
        })
      ),
    }),
    about: z.object({
      title: z.string(),
      content: z.string(),
      content_2: z.string(),
      image: z.string(),
      button: z.object({
        enable: z.boolean(),
        label: z.string(),
        link: z.string(),
      }),
    }),
  }),
});

const faqCollection = defineCollection({
  loader: glob({
    pattern: "faq.{md,mdx}",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    header: z.object({
      title: z.string(),
      content: z.string(),
    }),
    title: z.string(),
    content: z.string(),
    faqs: z.array(
      z.object({
        question: z.string(),
        answer: z.string(),
      })
    ),
  }),
});

const testimonialsCollection = defineCollection({
  loader: glob({
    pattern: "testimonial.{md,mdx}",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    homepage_title: z.string(),
    content: z.string(),
    testimonials: z.array(
      z.object({
        name: z.string(),
        designation: z.string(),
        avatar: z.string(),
        content: z.string(),
      })
    ),
  }),
});

const serviceCollection = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "src/content/service",
  }),
  schema: z.object({
    ...commonFields,
    banner_title: z.string().optional(),
    button: z
      .object({
        enable: z.boolean(),
        label: z.string(),
        link: z.string(),
      })
      .optional(),
    contact_1: z.string().optional(),
    contact_2: z.string().optional(),
  }),
});

const callToActionCollection = defineCollection({
  loader: glob({
    pattern: "call-to-action.{md,mdx}",
    base: "src/content/sections",
  }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    image: z.string(),
    description: z.string(),
    button: z.object({
      enable: z.boolean().default(true),
      label: z.string(),
      link: z.string(),
    }),
  }),
});

const termsCollection = defineCollection({
  loader: glob({ pattern: "terms.{md,mdx}", base: "src/content/sections" }),
  schema: z.object({
    enable: z.boolean(),
    title: z.string(),
    meta_title: z.string().optional(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    header: z.object({
      title: z.string(),
      content: z.string(),
    }),
  }),
});

export const collections = {
  about: aboutCollection,
  contact: contactCollection,
  homepage: homeCollection,
  faq: faqCollection,
  testimonials: testimonialsCollection,
  services: serviceCollection,
  callToAction: callToActionCollection,
  terms: termsCollection,
};
