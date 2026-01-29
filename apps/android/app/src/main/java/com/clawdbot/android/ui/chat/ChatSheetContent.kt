package com.clawdbot.android.ui.chat

import android.content.ContentResolver
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import com.clawdbot.android.MainViewModel
import com.clawdbot.android.chat.OutgoingAttachment
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ChatSheetContent(viewModel: MainViewModel) {
  val messages by viewModel.chatMessages.collectAsState()
  val errorText by viewModel.chatError.collectAsState()
  val pendingRunCount by viewModel.pendingRunCount.collectAsState()
  val healthOk by viewModel.chatHealthOk.collectAsState()
  val sessionKey by viewModel.chatSessionKey.collectAsState()
  val mainSessionKey by viewModel.mainSessionKey.collectAsState()
  val thinkingLevel by viewModel.chatThinkingLevel.collectAsState()
  val streamingAssistantText by viewModel.chatStreamingAssistantText.collectAsState()
  val pendingToolCalls by viewModel.chatPendingToolCalls.collectAsState()
  val sessions by viewModel.chatSessions.collectAsState()
  val seamColorArgb by viewModel.seamColorArgb.collectAsState()
  val talkEnabled by viewModel.talkEnabled.collectAsState()
  val seamColor = remember(seamColorArgb) { androidx.compose.ui.graphics.Color(seamColorArgb) }

  LaunchedEffect(mainSessionKey) {
    viewModel.loadChat(mainSessionKey)
    viewModel.refreshChatSessions(limit = 200)
  }

  val context = LocalContext.current
  val resolver = context.contentResolver
  val scope = rememberCoroutineScope()

  val attachments = remember { mutableStateListOf<PendingImageAttachment>() }
  var cameraImageUri by remember { mutableStateOf<Uri?>(null) }

  // Image picker
  val pickImages =
    rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
      if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult
      scope.launch(Dispatchers.IO) {
        val next =
          uris.take(8).mapNotNull { uri ->
            try {
              loadAttachment(resolver, uri)
            } catch (_: Throwable) {
              null
            }
          }
        withContext(Dispatchers.Main) {
          attachments.addAll(next)
        }
      }
    }

  // File picker (any file type)
  val pickFiles =
    rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
      if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult
      scope.launch(Dispatchers.IO) {
        val next =
          uris.take(8).mapNotNull { uri ->
            try {
              loadAttachment(resolver, uri)
            } catch (_: Throwable) {
              null
            }
          }
        withContext(Dispatchers.Main) {
          attachments.addAll(next)
        }
      }
    }

  // Camera capture
  val takePicture =
    rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
      if (success && cameraImageUri != null) {
        scope.launch(Dispatchers.IO) {
          try {
            val att = loadAttachment(resolver, cameraImageUri!!)
            withContext(Dispatchers.Main) {
              attachments.add(att)
            }
          } catch (_: Throwable) {
            // Failed to load camera image
          }
        }
      }
    }

  fun openCamera() {
    val contentValues = ContentValues().apply {
      put(MediaStore.Images.Media.DISPLAY_NAME, "camera_${System.currentTimeMillis()}.jpg")
      put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
    }
    val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
    if (uri != null) {
      cameraImageUri = uri
      takePicture.launch(uri)
    }
  }

  var drawerOpen by remember { mutableStateOf(false) }
  val sessionOptions = resolveSessionChoices(sessionKey, sessions, mainSessionKey = mainSessionKey)
  val drawerWidth = 280.dp
  val density = LocalDensity.current

  Box(modifier = Modifier.fillMaxSize()) {
    // Main content
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 12.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      ChatMessageListCard(
      messages = messages,
      pendingRunCount = pendingRunCount,
      pendingToolCalls = pendingToolCalls,
      streamingAssistantText = streamingAssistantText,
      modifier = Modifier.weight(1f, fill = true),
    )

    ChatComposer(
      sessionKey = sessionKey,
      sessions = sessions,
      mainSessionKey = mainSessionKey,
      healthOk = healthOk,
      thinkingLevel = thinkingLevel,
      pendingRunCount = pendingRunCount,
      errorText = errorText,
      attachments = attachments,
      seamColor = seamColor,
      talkEnabled = talkEnabled,
      onOpenCamera = { openCamera() },
      onPickImages = { pickImages.launch("image/*") },
      onPickFiles = { pickFiles.launch(arrayOf("*/*")) },
      onShareScreen = { /* TODO: Trigger screen share - sends request to agent */ },
      onRemoveAttachment = { id -> attachments.removeAll { it.id == id } },
      onSetThinkingLevel = { level -> viewModel.setChatThinkingLevel(level) },
      onSelectSession = { key -> viewModel.switchChatSession(key) },
      onRefresh = {
        viewModel.refreshChat()
        viewModel.refreshChatSessions(limit = 200)
      },
      onAbort = { viewModel.abortChat() },
      onToggleTalk = { viewModel.setTalkEnabled(!talkEnabled) },
      onSend = { text ->
        val outgoing =
          attachments.map { att ->
            val type = when {
              att.mimeType.startsWith("image/") -> "image"
              else -> "file"
            }
            OutgoingAttachment(
              type = type,
              mimeType = att.mimeType,
              fileName = att.fileName,
              base64 = att.base64,
            )
          }
        viewModel.sendChat(message = text, thinking = thinkingLevel, attachments = outgoing)
        attachments.clear()
      },
    )
    }

    // Hamburger button (floating, only when drawer is closed)
    if (!drawerOpen) {
      Surface(
        onClick = { drawerOpen = true },
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier
          .padding(4.dp)
          .size(44.dp)
          .align(Alignment.TopStart),
      ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
          Icon(
            Icons.Default.Menu,
            contentDescription = "Sessions",
            modifier = Modifier.size(26.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      }
    }

    // Drawer overlay
    if (drawerOpen) {
      // Scrim (darkened background)
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(Color.Black.copy(alpha = 0.5f))
          .clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = { drawerOpen = false }
          )
      )
    }

    // Sliding drawer
    val drawerOffset by animateDpAsState(
      targetValue = if (drawerOpen) 0.dp else (-drawerWidth),
      animationSpec = tween(durationMillis = 250),
      label = "drawerOffset"
    )
    
    Surface(
      modifier = Modifier
        .fillMaxHeight()
        .width(drawerWidth)
        .offset { IntOffset(with(density) { drawerOffset.roundToPx() }, 0) },
      color = Color(0xFF1A1A1A),
      shape = RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp),
    ) {
      Column(
        modifier = Modifier
          .fillMaxSize()
          .padding(vertical = 16.dp),
      ) {
        // Header with hamburger to close
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Surface(
            onClick = { drawerOpen = false },
            shape = CircleShape,
            color = Color.White.copy(alpha = 0.1f),
            modifier = Modifier.size(44.dp),
          ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
              Icon(
                Icons.Default.Menu,
                contentDescription = "Close",
                modifier = Modifier.size(26.dp),
                tint = Color.White.copy(alpha = 0.8f),
              )
            }
          }
          Spacer(Modifier.width(12.dp))
          Text(
            "Sessions",
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
          )
        }
        
        Spacer(Modifier.height(8.dp))
        
        // Sessions list
        LazyColumn(
          modifier = Modifier.fillMaxSize(),
          verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
          items(sessionOptions, key = { it.key }) { entry ->
            val isSelected = entry.key == sessionKey
            Surface(
              onClick = {
                viewModel.switchChatSession(entry.key)
                drawerOpen = false
              },
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
              shape = RoundedCornerShape(12.dp),
              color = if (isSelected) Color.White.copy(alpha = 0.1f) else Color.Transparent,
            ) {
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(horizontal = 12.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Text(
                  entry.displayName ?: entry.key,
                  style = MaterialTheme.typography.bodyMedium,
                  color = if (isSelected) Color.White else Color.White.copy(alpha = 0.8f),
                  modifier = Modifier.weight(1f),
                )
                if (isSelected) {
                  Text("✓", color = Color.White.copy(alpha = 0.6f))
                }
              }
            }
          }
        }
      }
    }
  }
}

data class PendingImageAttachment(
  val id: String,
  val fileName: String,
  val mimeType: String,
  val base64: String,
)

private suspend fun loadAttachment(resolver: ContentResolver, uri: Uri): PendingImageAttachment {
  val mimeType = resolver.getType(uri) ?: "application/octet-stream"
  val fileName = (uri.lastPathSegment ?: "file").substringAfterLast('/')
  val bytes =
    withContext(Dispatchers.IO) {
      resolver.openInputStream(uri)?.use { input ->
        val out = ByteArrayOutputStream()
        input.copyTo(out)
        out.toByteArray()
      } ?: ByteArray(0)
    }
  if (bytes.isEmpty()) throw IllegalStateException("empty attachment")
  val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
  return PendingImageAttachment(
    id = uri.toString() + "#" + System.currentTimeMillis().toString(),
    fileName = fileName,
    mimeType = mimeType,
    base64 = base64,
  )
}
