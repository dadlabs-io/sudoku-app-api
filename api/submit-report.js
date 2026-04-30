export default async function handler(request, response) {
  console.log('Handler called with method:', request.method);
  
  if (request.method !== 'POST') {
    return response.status(405).json({ 
      success: false,
      error: 'Method Not Allowed. Use POST.' 
    });
  }

  try {
    console.log('Parsing request body...');
    const { title, description, type, appVersion, deviceInfo, logs, attachments } = request.body;
    console.log('Body parsed:', { 
      title, 
      description, 
      type, 
      hasLogs: !!logs, 
      attachmentCount: attachments?.length || 0 
    });

    // Validate required fields
    if (!title || !description || !type) {
      console.log('Validation failed - missing fields');
      return response.status(400).json({ 
        success: false,
        error: 'Missing required fields: title, description, type' 
      });
    }

    // Validate type
    if (!['bug', 'feature'].includes(type.toLowerCase())) {
      return response.status(400).json({ 
        success: false,
        error: 'Type must be "bug" or "feature"' 
      });
    }

    // Check for GitHub token
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('GITHUB_TOKEN not set');
      return response.status(500).json({ 
        success: false,
        error: 'GitHub token not configured' 
      });
    }

    // Build issue data
    const owner = process.env.GITHUB_OWNER || 'dadlabs-io';
    const repo = process.env.GITHUB_REPO || 'sudoku-app-feedback';
    const issueTitle = `[${type.toUpperCase()}] ${title}`;
    let issueBody = `**Description:**\n${description}\n\n`;
    
    // Add context section
    if (appVersion || deviceInfo) {
      issueBody += '---\n**Report Context:**\n';
      if (appVersion) {
        issueBody += `- **App Version:** ${appVersion}\n`;
      }
      if (deviceInfo) {
        issueBody += `- **Device Info:** ${JSON.stringify(deviceInfo)}\n`;
      }
      issueBody += `- **Submitted:** ${new Date().toISOString()}\n`;
    }

    // Add logs section (collapsible)
    if (logs) {
      const logLineCount = logs.split('\n').length;
      issueBody += '\n---\n';
      issueBody += `<details>\n<summary>📋 App Logs (Last ${logLineCount} lines)</summary>\n\n`;
      issueBody += '```\n';
      issueBody += logs;
      issueBody += '\n```\n';
      issueBody += '</details>\n';
    }

    console.log('Creating GitHub issue...');
    
    // Use GitHub REST API directly via fetch
    const githubResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: [type === 'bug' ? 'bug' : 'enhancement', 'from-app'],
        }),
      }
    );

    console.log('GitHub API response status:', githubResponse.status);
    const githubData = await githubResponse.json();
    console.log('GitHub API response data:', githubData);

    if (!githubResponse.ok) {
      console.error('GitHub API error:', githubData);
      return response.status(githubResponse.status).json({
        success: false,
        error: `GitHub API error: ${githubData.message || 'Unknown error'}`,
      });
    }

    console.log('Issue created successfully:', githubData.html_url);
    
    // Upload attachments if present
    let imageMarkdown = '';
    let attachmentCount = 0;
    if (attachments && attachments.length > 0) {
      console.log(`Uploading ${attachments.length} attachment(s) to repo...`);
      
      const issueNumber = githubData.number;
      const imageUrls = [];
      
      for (const attachment of attachments) {
        try {
          // Build file path: attachments/issue-{number}/{filename}
          const filePath = `attachments/issue-${issueNumber}/${attachment.filename}`;
          
          console.log(`Uploading ${attachment.filename} to ${filePath}...`);
          
          // Upload file to GitHub repo
          const uploadResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              body: JSON.stringify({
                message: `Add attachment for issue #${issueNumber}: ${attachment.filename}`,
                content: attachment.content, // Already base64
                branch: 'main',
              }),
            }
          );
          
          if (uploadResponse.ok) {
            console.log(`✓ Uploaded: ${attachment.filename}`);
            
            // Build jsDelivr CDN URL
            const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@main/${filePath}`;
            imageUrls.push({ filename: attachment.filename, url: jsdelivrUrl, mimeType: attachment.mimeType });
            attachmentCount++;
          } else {
            const errorData = await uploadResponse.json();
            console.error(`✗ Failed to upload ${attachment.filename}:`, errorData);
          }
        } catch (uploadError) {
          console.error(`Failed to upload attachment ${attachment.filename}:`, uploadError);
        }
      }
      
      // Build markdown for images
      if (imageUrls.length > 0) {
        imageMarkdown = '\n\n---\n### 📎 Attachments\n\n';
        imageUrls.forEach(({ filename, url, mimeType }) => {
          if (mimeType.startsWith('image/')) {
            // Embed image inline
            imageMarkdown += `**${filename}**\n\n![${filename}](${url})\n\n`;
          } else {
            // Just link for non-images
            imageMarkdown += `**${filename}** - [Download](${url})\n\n`;
          }
        });
      }
      
      console.log(`Uploaded ${attachmentCount}/${attachments.length} attachment(s)`);
    }
    
    // Update issue body with images if any were uploaded
    if (imageMarkdown) {
      console.log('Updating issue body with attachment links...');
      const updatedBody = issueBody + imageMarkdown;
      
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${githubData.number}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({
            body: updatedBody,
          }),
        }
      );
      
      console.log('✓ Issue body updated with attachments');
    }
    
    return response.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      issueUrl: githubData.html_url,
      issueNumber: githubData.number,
      attachmentsUploaded: attachmentCount,
    });

  } catch (error) {
    console.error('Handler error:', error);
    return response.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
}
