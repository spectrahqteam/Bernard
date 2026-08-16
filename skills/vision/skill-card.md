## Description: <br>
See and understand images when the current model has no native vision by sending a selected image and prompt to a configurable OpenAI-compatible vision model. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[kotot](https://clawhub.ai/user/kotot) <br>

### License/Terms of Use: <br>
MIT-0 <br>


## Use Case: <br>
Developers and agents use this skill when a text-only model needs to inspect screenshots, photos, charts, UI mockups, scanned pages, or images referenced by URL. It returns a vision model's text answer so the agent can continue OCR, description, diagnosis, comparison, or reasoning tasks. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: Selected images and prompts are sent to the configured VISION_BASE_URL, which may expose sensitive screenshots, documents, receipts, credentials, or regulated data to that service. <br>
Mitigation: Use a trusted local endpoint for private material and review environment variables or .claude/settings.json before running the skill. <br>


## Reference(s): <br>
- [README.md](README.md) <br>
- [ClawHub Skill Page](https://clawhub.ai/kotot/skills/vision) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, shell commands, configuration, guidance] <br>
**Output Format:** [Plain text or Markdown returned on stdout; errors are written to stderr.] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [May include OCR transcripts, image descriptions, chart or table extraction, screenshot diagnostics, or focused answers based on the configured model response.] <br>

## Skill Version(s): <br>
1.0.1 (source: server release metadata) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
