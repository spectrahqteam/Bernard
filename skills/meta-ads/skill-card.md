## Description: <br>
Manage Meta Ads campaigns, ad sets, ads, creatives, and performance metrics through Meta's Ads API. <br>

This skill is ready for commercial/non-commercial use. <br>

## Publisher: <br>
[zachgodsell93](https://clawhub.ai/user/zachgodsell93) <br>

### License/Terms of Use: <br>


## Use Case: <br>
Developers, marketing operators, and agents use this skill to prepare Meta Ads API requests for campaign management, ad creative operations, and performance reporting. It is intended for accounts where the operator has explicit authorization to read and modify ads data. <br>

### Deployment Geography for Use: <br>
Global <br>

## Known Risks and Mitigations: <br>
Risk: The skill can guide creation, updates, deletes, activation, and budget changes in a real Meta Ads account. <br>
Mitigation: Require explicit human approval before any write action, activation, budget change, or delete operation, and set spend limits in Meta Business Manager. <br>
Risk: Access tokens and app secrets could be exposed through prompts, logs, URLs, or generated files. <br>
Mitigation: Use a dedicated least-privilege token scoped to the intended account, pass secrets through approved secret storage, and avoid placing credentials in prompts, logs, URLs, or source files. <br>


## Reference(s): <br>
- [ClawHub skill page](https://clawhub.ai/zachgodsell93/skills/meta-ads) <br>
- [Publisher profile](https://clawhub.ai/user/zachgodsell93) <br>


## Skill Output: <br>
**Output Type(s):** [text, markdown, shell commands, configuration, guidance] <br>
**Output Format:** [Markdown with bash and JSON examples] <br>
**Output Parameters:** [1D] <br>
**Other Properties Related to Output:** [Produces API request examples and setup guidance; actions should be reviewed before execution against a live ad account.] <br>

## Skill Version(s): <br>
1.0.0 (source: release metadata and artifact frontmatter) <br>

## Ethical Considerations: <br>
Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment. <br>
