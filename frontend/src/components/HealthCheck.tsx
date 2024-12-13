import React, { useState, useEffect } from "react";

const HealthCheck = () => {
    const [status, setStatus] = useState("");

    useEffect(() => {
        fetch("/api/health")
            .then((res) => res.text())
            .then((data) => setStatus(data))
            .catch(() => setStatus("Error"));
    }, []);

    return <div>Backend Status: {status}</div>;
};

export default HealthCheck;
