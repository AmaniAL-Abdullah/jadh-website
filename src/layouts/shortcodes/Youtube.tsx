import React, { useEffect } from "react";

const Youtube = ({ id, title, ...rest }: { id: string; title: string; [key: string]: any }) => {
  useEffect(() => {
    import("@justinribeiro/lite-youtube");
  }, []);

  return (
    // @ts-ignore
    <lite-youtube videoid={id} videotitle={title} {...rest} className="rounded-lg" />
  );
};

export default Youtube;
