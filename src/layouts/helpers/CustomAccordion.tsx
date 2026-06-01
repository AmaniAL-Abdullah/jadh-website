import { markdownify } from "@/lib/utils/textConverter";
import type { CollectionEntry } from "astro:content";
import React, { useState } from "react";

const CustomAccordion = ({
  faqs,
}: {
  faqs: CollectionEntry<"faq">["data"];
}) => {
  const [activeTab, setActiveTab] = useState<number | null>(0);

  return (
    <section className="section pb-0">
      <div className="container">
        <div className="mb-10">
          <h2
            className="text-center pb-4"
            data-aos="fade-up-sm"
            dangerouslySetInnerHTML={{ __html: markdownify(faqs.title) }}
          />
          <p
            className="max-w-xl mx-auto text-center"
            data-aos="fade-up-sm"
            dangerouslySetInnerHTML={{ __html: markdownify(faqs.content) }}
          />
        </div>

        <div className="row justify-center">
          <div className="lg:col-8 space-y-5">
            {faqs.faqs.map((f, i: number) => (
              <div key={i} data-aos="fade-up-sm" data-aos-delay={i * 50}>
                <div className={`accordion ${activeTab === i && "active"}`}>
                  <button
                    className="accordion-header"
                    onClick={() => {
                      activeTab === i ? setActiveTab(null) : setActiveTab(i);
                    }}
                  >
                    <div className="bg-secondary/15 w-10 h-10 rounded-full flex justify-center items-center shrink-0">
                      <p className="text-secondary font-bold text-lg">
                        {i + 1}
                      </p>
                    </div>
                    {f.question}
                  </button>
                  <div className="accordion-content">
                    <p dangerouslySetInnerHTML={{ __html: f.answer }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CustomAccordion;
