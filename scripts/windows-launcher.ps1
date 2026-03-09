param(
  [switch]$SmokeTest,
  [ValidateSet("setup", "running")]
  [string]$PreviewState = "setup",
  [switch]$LayoutCheck,
  [string]$ConfigPath = "",
  [string]$AppJsPath = "",
  [string]$NodePath = "",
  [switch]$SelfTest,
  [string]$SelfTestBaseUrl = "",
  [string]$SelfTestClient = "selftest-client",
  [string]$SelfTestToken = "selftest-token"
)

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Net.Http

$xamlSource = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="FabriX Bridge Launcher"
        Width="900"
        Height="620"
        MinWidth="840"
        MinHeight="580"
        WindowStartupLocation="CenterScreen"
        Background="#EEF1F3"
        FontFamily="Segoe UI">
  <Window.Resources>
    <SolidColorBrush x:Key="AppBgBrush" Color="#EEF1F3" />
    <SolidColorBrush x:Key="SurfaceBrush" Color="#FFFFFF" />
    <SolidColorBrush x:Key="SurfaceAltBrush" Color="#F6F7F8" />
    <SolidColorBrush x:Key="SurfaceDeepBrush" Color="#E9EDF0" />
    <SolidColorBrush x:Key="LineBrush" Color="#D4D8DD" />
    <SolidColorBrush x:Key="TextBrush" Color="#101418" />
    <SolidColorBrush x:Key="MutedBrush" Color="#66707A" />
    <SolidColorBrush x:Key="AccentBrush" Color="#17212B" />
    <SolidColorBrush x:Key="AccentDeepBrush" Color="#0F172A" />
    <SolidColorBrush x:Key="AccentSoftBrush" Color="#E9EDF0" />

    <Style x:Key="CardStyle" TargetType="Border">
      <Setter Property="CornerRadius" Value="12" />
      <Setter Property="Background" Value="{StaticResource SurfaceBrush}" />
      <Setter Property="BorderBrush" Value="{StaticResource LineBrush}" />
      <Setter Property="BorderThickness" Value="1" />
      <Setter Property="Padding" Value="12" />
    </Style>

    <Style x:Key="PrimaryButtonStyle" TargetType="Button">
      <Setter Property="Background" Value="{StaticResource AccentBrush}" />
      <Setter Property="Foreground" Value="White" />
      <Setter Property="FontWeight" Value="Bold" />
      <Setter Property="Padding" Value="14,9" />
      <Setter Property="BorderThickness" Value="0" />
      <Setter Property="Cursor" Value="Hand" />
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" CornerRadius="10">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" Margin="10,2" />
            </Border>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="SecondaryButtonStyle" TargetType="Button">
      <Setter Property="Background" Value="{StaticResource SurfaceAltBrush}" />
      <Setter Property="Foreground" Value="{StaticResource TextBrush}" />
      <Setter Property="FontWeight" Value="SemiBold" />
      <Setter Property="Padding" Value="13,9" />
      <Setter Property="BorderBrush" Value="{StaticResource LineBrush}" />
      <Setter Property="BorderThickness" Value="1" />
      <Setter Property="Cursor" Value="Hand" />
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="10">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" Margin="10,2" />
            </Border>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>

    <Style x:Key="GhostButtonStyle" TargetType="Button" BasedOn="{StaticResource SecondaryButtonStyle}">
      <Setter Property="Background" Value="#FFFFFF" />
      <Setter Property="Foreground" Value="{StaticResource MutedBrush}" />
    </Style>

    <Style TargetType="TextBlock">
      <Setter Property="Foreground" Value="{StaticResource TextBrush}" />
    </Style>

    <Style TargetType="TextBox">
      <Setter Property="Foreground" Value="{StaticResource TextBrush}" />
      <Setter Property="Background" Value="White" />
      <Setter Property="BorderBrush" Value="{StaticResource LineBrush}" />
      <Setter Property="BorderThickness" Value="1" />
      <Setter Property="Padding" Value="11,8" />
      <Setter Property="FontSize" Value="13" />
      <Setter Property="Margin" Value="0,6,0,0" />
    </Style>

    <Style TargetType="PasswordBox">
      <Setter Property="Foreground" Value="{StaticResource TextBrush}" />
      <Setter Property="Background" Value="White" />
      <Setter Property="BorderBrush" Value="{StaticResource LineBrush}" />
      <Setter Property="BorderThickness" Value="1" />
      <Setter Property="Padding" Value="11,8" />
      <Setter Property="FontSize" Value="13" />
      <Setter Property="Margin" Value="0,6,0,0" />
    </Style>

    <Style TargetType="Expander">
      <Setter Property="Background" Value="{StaticResource SurfaceBrush}" />
      <Setter Property="BorderBrush" Value="{StaticResource LineBrush}" />
      <Setter Property="BorderThickness" Value="1" />
      <Setter Property="Margin" Value="0,0,0,12" />
    </Style>
  </Window.Resources>

  <Grid Background="{StaticResource AppBgBrush}">
    <Border Margin="12" Padding="0" CornerRadius="18" Background="#FCFCFD" BorderBrush="#D9DDE2" BorderThickness="1">
      <Grid>
        <Grid.RowDefinitions>
          <RowDefinition Height="Auto" />
          <RowDefinition Height="*" />
        </Grid.RowDefinitions>

        <Border Grid.Row="0" BorderBrush="#E3E6EA" BorderThickness="0,0,0,1" Background="#FFFFFF">
          <Grid Margin="16,10,16,8">
            <Grid.RowDefinitions>
              <RowDefinition Height="Auto" />
              <RowDefinition Height="Auto" />
            </Grid.RowDefinitions>

            <Grid Grid.Row="0">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="*" />
                <ColumnDefinition Width="Auto" />
              </Grid.ColumnDefinitions>

              <StackPanel>
                <TextBlock Text="FabriX Bridge" FontSize="21" FontWeight="Bold" />
              </StackPanel>

              <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center">
                <Border Padding="12,6" Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10">
                  <TextBlock x:Name="SavedStateBadge" Text="저장된 설정 없음" Foreground="{StaticResource MutedBrush}" FontSize="11" FontWeight="Bold" />
                </Border>
                <Border Margin="8,0,0,0" Padding="12,6" Background="{StaticResource AccentSoftBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10">
                  <TextBlock x:Name="WindowStatusText" Text="설정 대기" Foreground="{StaticResource AccentDeepBrush}" FontWeight="Bold" FontSize="11" />
                </Border>
              </StackPanel>
            </Grid>

            <Grid Grid.Row="1" Margin="0,8,0,0">
              <Grid.ColumnDefinitions>
                <ColumnDefinition Width="84" />
                <ColumnDefinition Width="84" />
                <ColumnDefinition Width="*" />
              </Grid.ColumnDefinitions>

              <Border x:Name="SetupStepCard" Grid.Column="0" CornerRadius="10" Padding="10,4" Background="#FFFFFF" BorderBrush="#17212B" BorderThickness="1">
                <TextBlock Text="설정" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" />
              </Border>

              <Border x:Name="RunningStepCard" Grid.Column="1" CornerRadius="10" Padding="10,4" Margin="8,0,0,0" Background="#FFFFFF" BorderBrush="{StaticResource LineBrush}" BorderThickness="1">
                <TextBlock Text="실행" FontSize="12" FontWeight="Bold" HorizontalAlignment="Center" />
              </Border>
            </Grid>
          </Grid>
        </Border>

        <Grid Grid.Row="1" Margin="16,10,16,14">
          <Grid x:Name="SetupPanel">
            <ScrollViewer VerticalScrollBarVisibility="Auto">
              <StackPanel>
                <Border Style="{StaticResource CardStyle}" Margin="0,0,0,12">
                  <Grid>
                    <Grid.ColumnDefinitions>
                      <ColumnDefinition Width="*" />
                      <ColumnDefinition Width="216" />
                    </Grid.ColumnDefinitions>

                    <StackPanel Margin="0,0,14,0">
                      <TextBlock Text="연결 설정" FontSize="22" FontWeight="Bold" />
                    </StackPanel>

                    <Grid Grid.Column="1">
                      <Grid.RowDefinitions>
                        <RowDefinition Height="Auto" />
                        <RowDefinition Height="Auto" />
                      </Grid.RowDefinitions>

                      <Border Grid.Row="0" Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="10,8">
                        <StackPanel>
                          <TextBlock Text="기본 경로" FontSize="10" Foreground="{StaticResource MutedBrush}" />
                          <TextBlock x:Name="PillBaseText" Text="/chat/completions" FontSize="12" FontWeight="SemiBold" Margin="0,2,0,0" TextTrimming="CharacterEllipsis" />
                        </StackPanel>
                      </Border>

                      <Border Grid.Row="1" Margin="0,8,0,0" Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="10,8">
                        <StackPanel>
                          <TextBlock Text="브리지" FontSize="10" Foreground="{StaticResource MutedBrush}" />
                          <TextBlock x:Name="PillHostText" Text="127.0.0.1:4000" FontSize="12" FontWeight="SemiBold" Margin="0,2,0,0" TextTrimming="CharacterEllipsis" />
                        </StackPanel>
                      </Border>
                    </Grid>
                  </Grid>
                </Border>

                <Border Style="{StaticResource CardStyle}" Margin="0,0,0,12">
                  <StackPanel>
                    <Grid>
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*" />
                        <ColumnDefinition Width="*" />
                      </Grid.ColumnDefinitions>

                      <StackPanel Margin="0,0,10,0">
                        <TextBlock Text="x-fabrix-client" FontSize="13" FontWeight="Bold" />
                        <TextBox x:Name="FabrixClientTextBox" />
                      </StackPanel>

                      <StackPanel Grid.Column="1" Margin="10,0,0,0">
                        <TextBlock Text="x-openapi-token" FontSize="13" FontWeight="Bold" />
                        <PasswordBox x:Name="FabrixTokenTextBox" />
                      </StackPanel>
                    </Grid>

                    <Border Margin="0,12,0,12" Height="1" Background="{StaticResource LineBrush}" />

                    <Grid>
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*" />
                        <ColumnDefinition Width="Auto" />
                      </Grid.ColumnDefinitions>

                      <StackPanel>
                        <TextBlock Text="기본 모델" FontSize="18" FontWeight="Bold" />
                      </StackPanel>

                      <Button x:Name="LoadModelsButton" Grid.Column="1" Content="모델 불러오기" Width="126" Height="40" Style="{StaticResource SecondaryButtonStyle}" />
                    </Grid>

                    <Border x:Name="ModelHintCard" Margin="0,10,0,0" Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="10">
                      <TextBlock Text="불러온 목록에서 기본 모델을 선택합니다." FontSize="12" Foreground="{StaticResource MutedBrush}" />
                    </Border>

                    <Border x:Name="LoadingCard" Margin="0,10,0,0" Background="{StaticResource SurfaceDeepBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="10" Visibility="Collapsed">
                      <TextBlock Text="모델 목록을 불러오는 중입니다..." FontSize="12" FontWeight="Bold" Foreground="{StaticResource AccentDeepBrush}" />
                    </Border>

                    <ScrollViewer Margin="0,10,0,0" MaxHeight="108" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled">
                      <WrapPanel x:Name="ModelWrapPanel" />
                    </ScrollViewer>
                  </StackPanel>
                </Border>

                <Expander Header="고급 설정" IsExpanded="False">
                  <Border Background="{StaticResource SurfaceAltBrush}" Padding="14">
                    <UniformGrid Columns="2" Rows="5">
                      <StackPanel Margin="0,0,10,10">
                        <TextBlock Text="FabriX base URL" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="BaseUrlTextBox" />
                      </StackPanel>
                      <StackPanel Margin="10,0,0,10">
                        <TextBlock Text="Chat path" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="ChatPathTextBox" />
                      </StackPanel>
                      <StackPanel Margin="0,0,10,10">
                        <TextBlock Text="Models path" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="ModelsPathTextBox" />
                      </StackPanel>
                      <StackPanel Margin="10,0,0,10">
                        <TextBlock Text="Request body model" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="RequestModelTextBox" />
                      </StackPanel>
                      <StackPanel Margin="0,0,10,10">
                        <TextBlock Text="Timeout (ms)" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="TimeoutTextBox" />
                      </StackPanel>
                      <StackPanel Margin="10,0,0,10">
                        <TextBlock Text="Bridge host" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="BridgeHostTextBox" />
                      </StackPanel>
                      <StackPanel Margin="0,0,10,0">
                        <TextBlock Text="Bridge port" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="BridgePortTextBox" />
                      </StackPanel>
                      <StackPanel Margin="10,0,0,0">
                        <TextBlock Text="CORS origin" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="CorsOriginTextBox" />
                      </StackPanel>
                      <StackPanel Margin="0,10,10,0">
                        <TextBlock Text="Bridge token" FontWeight="Bold" FontSize="13" />
                        <TextBox x:Name="BridgeTokenTextBox" />
                      </StackPanel>
                    </UniformGrid>
                  </Border>
                </Expander>

                <Grid Margin="0,2,0,6">
                  <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto" />
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                  </Grid.ColumnDefinitions>

                  <Button x:Name="PrefillButton" Grid.Column="0" Content="초기화" Width="84" Height="38" Style="{StaticResource GhostButtonStyle}" />
                  <TextBlock x:Name="SetupToastText" Grid.Column="1" VerticalAlignment="Center" Margin="14,0" FontSize="12" Foreground="{StaticResource AccentDeepBrush}" TextTrimming="CharacterEllipsis" />
                  <Button x:Name="StartButton" Grid.Column="2" Content="서버 시작" Width="112" Height="38" Style="{StaticResource PrimaryButtonStyle}" />
                </Grid>
              </StackPanel>
            </ScrollViewer>
          </Grid>

          <Grid x:Name="RunningPanel" Visibility="Collapsed">
            <ScrollViewer VerticalScrollBarVisibility="Auto">
              <StackPanel>
                <Border Style="{StaticResource CardStyle}" Margin="0,0,0,12">
                  <Grid>
                    <Grid.RowDefinitions>
                      <RowDefinition Height="Auto" />
                      <RowDefinition Height="Auto" />
                    </Grid.RowDefinitions>

                    <Grid Grid.Row="0">
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*" />
                        <ColumnDefinition Width="Auto" />
                      </Grid.ColumnDefinitions>

                      <StackPanel>
                        <TextBlock Text="서버 실행 중" FontSize="22" FontWeight="Bold" />
                      </StackPanel>

                      <Border Grid.Column="1" Background="{StaticResource AccentSoftBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="11,6" VerticalAlignment="Center">
                        <TextBlock Text="RUNNING" Foreground="{StaticResource AccentDeepBrush}" FontSize="11" FontWeight="Bold" />
                      </Border>
                    </Grid>

                    <Grid Grid.Row="1" Margin="0,12,0,0">
                      <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*" />
                        <ColumnDefinition Width="*" />
                      </Grid.ColumnDefinitions>

                      <Border Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="12" Margin="0,0,8,0">
                        <StackPanel>
                          <TextBlock Text="Base URL" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                          <TextBlock x:Name="RunningBaseUrlText" FontSize="15" FontWeight="Bold" Margin="0,6,0,0" TextWrapping="Wrap" />
                        </StackPanel>
                      </Border>

                      <Border Grid.Column="1" Background="{StaticResource SurfaceAltBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" CornerRadius="10" Padding="12" Margin="8,0,0,0">
                        <StackPanel>
                          <TextBlock Text="기본 모델" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                          <TextBlock x:Name="RunningModelText" FontSize="15" FontWeight="Bold" Margin="0,6,0,0" TextWrapping="Wrap" />
                          <TextBlock Text="설정 확인 후 시작" FontSize="11" Foreground="{StaticResource MutedBrush}" Margin="0,4,0,0" />
                        </StackPanel>
                      </Border>
                    </Grid>
                  </Grid>
                </Border>

                <Border Style="{StaticResource CardStyle}" Margin="0,0,0,12">
                  <Grid>
                    <Grid.ColumnDefinitions>
                      <ColumnDefinition Width="250" />
                      <ColumnDefinition Width="14" />
                      <ColumnDefinition Width="*" />
                    </Grid.ColumnDefinitions>

                    <StackPanel Grid.Column="0">
                      <TextBlock Text="설정 요약" FontSize="17" FontWeight="Bold" />
                      <Grid Margin="0,12,0,0">
                        <Grid.RowDefinitions>
                          <RowDefinition Height="Auto" />
                          <RowDefinition Height="Auto" />
                          <RowDefinition Height="Auto" />
                          <RowDefinition Height="Auto" />
                        </Grid.RowDefinitions>
                        <Grid.ColumnDefinitions>
                          <ColumnDefinition Width="76" />
                          <ColumnDefinition Width="*" />
                        </Grid.ColumnDefinitions>

                        <TextBlock Text="요청 주소" Grid.Row="0" Grid.Column="0" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                        <TextBlock x:Name="SummaryBaseUrlText" Grid.Row="0" Grid.Column="1" FontSize="12" FontFamily="Consolas" TextWrapping="Wrap" />

                        <TextBlock Text="모델 경로" Grid.Row="1" Grid.Column="0" Margin="0,10,0,0" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                        <TextBlock x:Name="SummaryModelsPathText" Grid.Row="1" Grid.Column="1" Margin="0,10,0,0" FontSize="12" FontFamily="Consolas" TextWrapping="NoWrap" TextTrimming="CharacterEllipsis" />

                        <TextBlock Text="Bridge" Grid.Row="2" Grid.Column="0" Margin="0,10,0,0" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                        <TextBlock x:Name="SummaryBridgeText" Grid.Row="2" Grid.Column="1" Margin="0,10,0,0" FontSize="12" FontFamily="Consolas" TextWrapping="NoWrap" TextTrimming="CharacterEllipsis" />

                        <TextBlock Text="토큰" Grid.Row="3" Grid.Column="0" Margin="0,10,0,0" FontSize="11" Foreground="{StaticResource MutedBrush}" />
                        <TextBlock x:Name="SummaryBridgeTokenText" Grid.Row="3" Grid.Column="1" Margin="0,10,0,0" FontSize="12" FontFamily="Consolas" TextWrapping="NoWrap" TextTrimming="CharacterEllipsis" />
                      </Grid>
                    </StackPanel>

                    <Border Grid.Column="1" Width="1" Background="{StaticResource LineBrush}" />

                    <StackPanel Grid.Column="2">
                      <Grid Margin="0,0,0,10">
                        <Grid.ColumnDefinitions>
                          <ColumnDefinition Width="*" />
                          <ColumnDefinition Width="Auto" />
                        </Grid.ColumnDefinitions>

                        <StackPanel>
                          <TextBlock Text="OpenCode 참고" FontSize="17" FontWeight="Bold" />
                        </StackPanel>

                        <Button x:Name="CopyButton" Grid.Column="1" Content="OpenCode 복사" Width="118" Height="38" Style="{StaticResource SecondaryButtonStyle}" />
                      </Grid>

                      <TextBox x:Name="SnippetTextBox" Height="118" IsReadOnly="True" AcceptsReturn="True" TextWrapping="NoWrap" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Auto" FontFamily="Consolas" FontSize="12" Background="{StaticResource SurfaceAltBrush}" Foreground="{StaticResource TextBrush}" BorderBrush="{StaticResource LineBrush}" BorderThickness="1" />
                    </StackPanel>
                  </Grid>
                </Border>

                <Grid Margin="0,2,0,6">
                  <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="Auto" />
                    <ColumnDefinition Width="*" />
                    <ColumnDefinition Width="Auto" />
                  </Grid.ColumnDefinitions>

                  <Button x:Name="ReopenButton" Grid.Column="0" Content="설정 다시 열기" Width="124" Height="38" Style="{StaticResource SecondaryButtonStyle}" />
                  <TextBlock x:Name="RunningToastText" Grid.Column="1" VerticalAlignment="Center" Margin="14,0" FontSize="12" Foreground="{StaticResource AccentDeepBrush}" TextTrimming="CharacterEllipsis" />
                  <Button x:Name="ShutdownButton" Grid.Column="2" Content="종료" Width="80" Height="38" Style="{StaticResource GhostButtonStyle}" />
                </Grid>
              </StackPanel>
            </ScrollViewer>
          </Grid>
        </Grid>
      </Grid>
    </Border>
  </Grid>
</Window>
'@

[xml]$xaml = $xamlSource
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

$controlNames = @(
  "WindowStatusText",
  "SetupStepCard",
  "RunningStepCard",
  "SavedStateBadge",
  "PillBaseText",
  "PillHostText",
  "FabrixClientTextBox",
  "FabrixTokenTextBox",
  "BaseUrlTextBox",
  "ChatPathTextBox",
  "ModelsPathTextBox",
  "RequestModelTextBox",
  "TimeoutTextBox",
  "BridgeHostTextBox",
  "BridgePortTextBox",
  "CorsOriginTextBox",
  "BridgeTokenTextBox",
  "LoadModelsButton",
  "ModelHintCard",
  "LoadingCard",
  "ModelWrapPanel",
  "PrefillButton",
  "StartButton",
  "SetupToastText",
  "SetupPanel",
  "RunningPanel",
  "RunningBaseUrlText",
  "RunningModelText",
  "SummaryBaseUrlText",
  "SummaryModelsPathText",
  "SummaryBridgeText",
  "SummaryBridgeTokenText",
  "SnippetTextBox",
  "CopyButton",
  "ReopenButton",
  "ShutdownButton",
  "RunningToastText"
)

$controls = @{}
foreach ($name in $controlNames) {
  $controls[$name] = $window.FindName($name)
}

if (-not $NodePath) {
  try {
    $NodePath = (Get-Command node -ErrorAction Stop).Source
  }
  catch {
    $NodePath = "node"
  }
}

if (-not $AppJsPath) {
  $AppJsPath = Join-Path (Split-Path -Parent $PSScriptRoot) "app.js"
}

if (-not $ConfigPath) {
  $appData = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME ".config" }
  $ConfigPath = Join-Path $appData "sds-fabrix-bridge\config.json"
}

$defaults = @{
  BaseUrl = "https://nsds-api.fabrix-s.samsungsds.com/sds/trial/api-llm/openapi/llm"
  ChatPath = "/chat/completions"
  ModelsPath = "/v1/models"
  RequestModel = "/mnt/models"
  Timeout = "60000"
  BridgeHost = "127.0.0.1"
  BridgePort = "4000"
  CorsOrigin = "*"
  BridgeToken = ""
}

$sampleModels = @(
  [pscustomobject]@{ modelId = 16; modelGuid = "preview-16"; alias = "fabrix/gpt-oss-120b-mid-16"; displayName = "gpt-oss-120b(Mid)"; description = "Reasoning, 128k context."; names = @(); descriptions = @() },
  [pscustomobject]@{ modelId = 13; modelGuid = "preview-13"; alias = "fabrix/gpt-oss-120b-low-13"; displayName = "gpt-oss-120b(Low)"; description = "Fast response, light reasoning."; names = @(); descriptions = @() },
  [pscustomobject]@{ modelId = 4; modelGuid = "preview-4"; alias = "fabrix/samsung-2-3-37b-4"; displayName = "Samsung 2.3 37B"; description = "Writing, summary, translation."; names = @(); descriptions = @() },
  [pscustomobject]@{ modelId = 9; modelGuid = "preview-9"; alias = "fabrix/llama-3-3-9"; displayName = "Llama 3.3"; description = "Multilingual chat and code."; names = @(); descriptions = @() }
)

$script:modelCatalog = @()

$state = [ordered]@{
  ModelsLoaded = $false
  SelectedModelId = $null
  ServerProcess = $null
  ConfigLoaded = $false
}

$secondaryButtonStyle = $window.Resources["SecondaryButtonStyle"]

function New-Brush([string]$hex) {
  [System.Windows.Media.BrushConverter]::new().ConvertFrom($hex)
}

function Join-Url([string]$baseUrl, [string]$pathname) {
  $trimmed = [string]$baseUrl
  while ($trimmed.EndsWith("/")) {
    $trimmed = $trimmed.Substring(0, $trimmed.Length - 1)
  }
  if (-not $pathname.StartsWith("/")) {
    $pathname = "/$pathname"
  }
  return "$trimmed$pathname"
}

function Get-LocalizedContent($items) {
  if (-not $items) {
    return ""
  }

  $normalized = @()
  foreach ($item in @($items)) {
    if ($null -eq $item) { continue }
    $content = [string]$item.content
    if (-not $content.Trim()) { continue }
    $normalized += [pscustomobject]@{
      languageCode = [string]$item.languageCode
      content = $content.Trim()
    }
  }

  $english = $normalized | Where-Object { $_.languageCode -eq "en" } | Select-Object -First 1
  if ($english -and $english.content) {
    return $english.content
  }

  $korean = $normalized | Where-Object { $_.languageCode -eq "ko" } | Select-Object -First 1
  if ($korean -and $korean.content) {
    return $korean.content
  }

  $first = $normalized | Select-Object -First 1
  if ($first -and $first.content) {
    return $first.content
  }

  return ""
}

function Convert-ToSlug([string]$value) {
  $lowered = [string]$value
  $lowered = $lowered.ToLowerInvariant()
  $slug = [System.Text.RegularExpressions.Regex]::Replace($lowered, "[^a-z0-9]+", "-")
  $slug = $slug.Trim("-")
  if (-not $slug) {
    return ""
  }
  return $slug
}

function Build-ModelAlias([string]$displayName, [int]$modelId) {
  $slug = Convert-ToSlug $displayName
  if (-not $slug) {
    $slug = "model-$modelId"
  }
  return "fabrix/$slug-$modelId"
}

function Normalize-FabriXModel($rawModel) {
  if ($null -eq $rawModel) {
    return $null
  }

  $modelId = [int]$rawModel.modelId
  if ($modelId -le 0) {
    return $null
  }

  $displayName = Get-LocalizedContent $rawModel.name
  if (-not $displayName) {
    $displayName = "model-$modelId"
  }

  $description = Get-LocalizedContent $rawModel.description
  return [pscustomobject]@{
    modelId = $modelId
    modelGuid = [string]$rawModel.modelGuid
    alias = Build-ModelAlias $displayName $modelId
    displayName = $displayName
    description = $description
    names = @($rawModel.name)
    descriptions = @($rawModel.description)
  }
}

function Build-CacheModels($models) {
  $cache = @()
  foreach ($model in @($models)) {
    $cache += [ordered]@{
      modelId = [int]$model.modelId
      modelGuid = [string]$model.modelGuid
      alias = [string]$model.alias
      displayName = [string]$model.displayName
      description = [string]$model.description
      names = @($model.names)
      descriptions = @($model.descriptions)
    }
  }
  return $cache
}

function Resolve-OpenCodeConfigPath {
  return Join-Path $HOME ".config\opencode\opencode.json"
}

function Quote-Argument([string]$value) {
  if ($null -eq $value) {
    return '""'
  }
  return '"' + ($value -replace '"', '\"') + '"'
}

function Parse-Integer([string]$value, [int]$fallback) {
  $parsed = 0
  if ([int]::TryParse([string]$value, [ref]$parsed)) {
    return $parsed
  }
  return $fallback
}

function Read-ConfigFile {
  if (-not (Test-Path $ConfigPath)) {
    return $null
  }

  try {
    return Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
  }
  catch {
    Set-Toast "SetupToastText" "기존 설정 파일을 읽지 못했습니다."
    return $null
  }
}

function Write-ConfigFile($configObject) {
  $dir = Split-Path -Parent $ConfigPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $json = $configObject | ConvertTo-Json -Depth 100
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ConfigPath, $json + [Environment]::NewLine, $utf8NoBom)
}

function Build-ConfigObject($models) {
  $current = Get-CurrentConfig
  $selected = @($models) | Where-Object { [int]$_.modelId -eq [int]$current.SelectedModelId } | Select-Object -First 1
  if (-not $selected) {
    throw "선택된 모델 정보를 찾지 못했습니다."
  }

  return [ordered]@{
    version = 1
    upstream = [ordered]@{
      baseUrl = $current.BaseUrl
      chatPath = $current.ChatPath
      modelsPath = $current.ModelsPath
      client = $current.FabrixClient
      token = $current.FabrixToken
      requestModelName = $current.RequestModel
      timeoutMs = [int]$current.Timeout
    }
    bridge = [ordered]@{
      host = $current.BridgeHost
      port = [int]$current.BridgePort
      token = $current.BridgeToken
      corsOrigin = $current.CorsOrigin
    }
    defaults = [ordered]@{
      modelAlias = $selected.alias
      modelId = [int]$selected.modelId
      modelGuid = $selected.modelGuid
      displayName = $selected.displayName
    }
    cache = [ordered]@{
      models = Build-CacheModels $models
      fetchedAt = [DateTime]::UtcNow.ToString("o")
    }
    integrations = [ordered]@{
      opencode = [ordered]@{
        enabled = $true
        configPath = Resolve-OpenCodeConfigPath
        setDefaultModel = $true
      }
    }
  }
}

function Fetch-FabriXModels {
  $config = Get-CurrentConfig
  if (-not $config.FabrixClient -or -not $config.FabrixToken) {
    throw "client 값과 token 값을 먼저 입력하세요."
  }

  $uri = Join-Url $config.BaseUrl $config.ModelsPath
  $handler = New-Object System.Net.Http.HttpClientHandler
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromMilliseconds([int]$config.Timeout)
  $client.DefaultRequestHeaders.Add("x-fabrix-client", $config.FabrixClient)
  $client.DefaultRequestHeaders.Add("x-openapi-token", $config.FabrixToken)

  try {
    $response = $client.GetAsync($uri).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "모델 조회 실패: $([int]$response.StatusCode) $body"
    }

    $parsed = $body | ConvertFrom-Json
    $normalized = @()
    foreach ($item in @($parsed)) {
      $normalizedModel = Normalize-FabriXModel $item
      if ($normalizedModel) {
        $normalized += $normalizedModel
      }
    }

    if ($normalized.Count -eq 0) {
      throw "조회된 모델이 없습니다."
    }
    return $normalized
  }
  finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Set-Defaults {
  $controls.BaseUrlTextBox.Text = $defaults.BaseUrl
  $controls.ChatPathTextBox.Text = $defaults.ChatPath
  $controls.ModelsPathTextBox.Text = $defaults.ModelsPath
  $controls.RequestModelTextBox.Text = $defaults.RequestModel
  $controls.TimeoutTextBox.Text = $defaults.Timeout
  $controls.BridgeHostTextBox.Text = $defaults.BridgeHost
  $controls.BridgePortTextBox.Text = $defaults.BridgePort
  $controls.CorsOriginTextBox.Text = $defaults.CorsOrigin
  $controls.BridgeTokenTextBox.Text = $defaults.BridgeToken
  Sync-HeaderPills
}

function Sync-HeaderPills {
  $chatPath = $controls.ChatPathTextBox.Text.Trim()
  if (-not $chatPath) {
    $chatPath = $defaults.ChatPath
  }
  $controls.PillBaseText.Text = $chatPath
  $controls.PillHostText.Text = "{0}:{1}" -f $controls.BridgeHostTextBox.Text.Trim(), $controls.BridgePortTextBox.Text.Trim()
}

function Set-SavedBadge([bool]$isSaved) {
  if ($isSaved) {
    $controls.SavedStateBadge.Text = "저장된 설정 있음"
    $controls.SavedStateBadge.Foreground = New-Brush "#0F172A"
  }
  else {
    $controls.SavedStateBadge.Text = "저장된 설정 없음"
    $controls.SavedStateBadge.Foreground = New-Brush "#66707A"
  }
}

function Set-Toast([string]$target, [string]$message) {
  $controls[$target].Text = $message
}

function Set-StepState([string]$mode) {
  if ($mode -eq "running") {
    $controls.SetupPanel.Visibility = "Collapsed"
    $controls.RunningPanel.Visibility = "Visible"
    $controls.WindowStatusText.Text = "서버 실행 중"
    $controls.SetupStepCard.Background = New-Brush "#FFFFFF"
    $controls.SetupStepCard.BorderBrush = New-Brush "#D4D8DD"
    $controls.RunningStepCard.Background = New-Brush "#F6F7F8"
    $controls.RunningStepCard.BorderBrush = New-Brush "#17212B"
  }
  else {
    $controls.SetupPanel.Visibility = "Visible"
    $controls.RunningPanel.Visibility = "Collapsed"
    $controls.WindowStatusText.Text = "설정 대기"
    $controls.SetupStepCard.Background = New-Brush "#F6F7F8"
    $controls.SetupStepCard.BorderBrush = New-Brush "#17212B"
    $controls.RunningStepCard.Background = New-Brush "#FFFFFF"
    $controls.RunningStepCard.BorderBrush = New-Brush "#D4D8DD"
  }
}

function Get-CurrentConfig {
  [ordered]@{
    FabrixClient = $controls.FabrixClientTextBox.Text.Trim()
    FabrixToken = $controls.FabrixTokenTextBox.Password.Trim()
    BaseUrl = $controls.BaseUrlTextBox.Text.Trim()
    ChatPath = $controls.ChatPathTextBox.Text.Trim()
    ModelsPath = $controls.ModelsPathTextBox.Text.Trim()
    RequestModel = $controls.RequestModelTextBox.Text.Trim()
    Timeout = Parse-Integer $controls.TimeoutTextBox.Text.Trim() 60000
    BridgeHost = $controls.BridgeHostTextBox.Text.Trim()
    BridgePort = Parse-Integer $controls.BridgePortTextBox.Text.Trim() 4000
    CorsOrigin = $controls.CorsOriginTextBox.Text.Trim()
    BridgeToken = $controls.BridgeTokenTextBox.Text.Trim()
    SelectedModelId = $state.SelectedModelId
  }
}

function Set-CurrentConfig($config) {
  if (-not $config) {
    return
  }

  $controls.FabrixClientTextBox.Text = [string]$config.upstream.client
  $controls.FabrixTokenTextBox.Password = [string]$config.upstream.token
  $controls.BaseUrlTextBox.Text = [string]$config.upstream.baseUrl
  $controls.ChatPathTextBox.Text = [string]$config.upstream.chatPath
  $controls.ModelsPathTextBox.Text = [string]$config.upstream.modelsPath
  $controls.RequestModelTextBox.Text = [string]$config.upstream.requestModelName
  $controls.TimeoutTextBox.Text = [string]$config.upstream.timeoutMs
  $controls.BridgeHostTextBox.Text = [string]$config.bridge.host
  $controls.BridgePortTextBox.Text = [string]$config.bridge.port
  $controls.CorsOriginTextBox.Text = [string]$config.bridge.corsOrigin
  $controls.BridgeTokenTextBox.Text = [string]$config.bridge.token
  $state.SelectedModelId = [int]$config.defaults.modelId
  Sync-HeaderPills
}

function New-ModelButton($model) {
  $currentModel = $model
  $button = [System.Windows.Controls.Button]::new()
  $button.Width = 196
  $button.Height = 92
  $button.Margin = "0,0,10,10"
  $button.Padding = "0"
  $button.BorderThickness = "1"
  $button.Background = if ($state.SelectedModelId -eq $currentModel.ModelId) { New-Brush "#F6F7F8" } else { New-Brush "#FFFFFF" }
  $button.BorderBrush = if ($state.SelectedModelId -eq $currentModel.ModelId) { New-Brush "#17212B" } else { New-Brush "#D4D8DD" }
  $button.HorizontalContentAlignment = "Stretch"
  $button.VerticalContentAlignment = "Stretch"
  if ($secondaryButtonStyle) {
    $button.Style = $secondaryButtonStyle
  }

  $content = [System.Windows.Controls.StackPanel]::new()
  $content.Margin = "10"

  $title = [System.Windows.Controls.TextBlock]::new()
  $title.Text = $currentModel.displayName
  $title.FontWeight = "Bold"
  $title.FontSize = 12
  $title.TextTrimming = "CharacterEllipsis"
  $content.Children.Add($title) | Out-Null

  $desc = [System.Windows.Controls.TextBlock]::new()
  $desc.Text = if ($currentModel.description) { $currentModel.description } else { "설명 없음" }
  $desc.Foreground = New-Brush "#66707A"
  $desc.FontSize = 10
  $desc.Margin = "0,4,0,8"
  $desc.TextWrapping = "NoWrap"
  $desc.TextTrimming = "CharacterEllipsis"
  $content.Children.Add($desc) | Out-Null

  $tag = [System.Windows.Controls.Border]::new()
  $tag.Background = New-Brush "#F6F7F8"
  $tag.BorderBrush = New-Brush "#D4D8DD"
  $tag.BorderThickness = "1"
  $tag.CornerRadius = "8"
  $tag.Padding = "6,3"
  $tag.HorizontalAlignment = "Left"

  $tagText = [System.Windows.Controls.TextBlock]::new()
  $tagText.Text = "modelId: $($currentModel.modelId)"
  $tagText.FontFamily = "Consolas"
  $tagText.FontSize = 10
  $tagText.Foreground = New-Brush "#66707A"
  $tag.Child = $tagText
  $content.Children.Add($tag) | Out-Null

  $button.Content = $content
  $button.Add_Click({
    $state.SelectedModelId = $currentModel.modelId
    Render-Models
    Set-Toast "SetupToastText" "$($currentModel.displayName) 모델을 선택했습니다."
  })

  return $button
}

function Render-Models {
  $controls.ModelHintCard.Visibility = "Collapsed"
  $controls.ModelWrapPanel.Children.Clear()
  foreach ($model in $script:modelCatalog) {
    $controls.ModelWrapPanel.Children.Add((New-ModelButton $model)) | Out-Null
  }
}

function Build-OpenCodeSnippet([string]$localBaseUrl, [string]$bridgeToken) {
  $apiKeyLine = ""
  if ($bridgeToken) {
    $apiKeyLine = '        "apiKey": "{env:FABRIX_BRIDGE_TOKEN}",' + [Environment]::NewLine
  }

  return @"
{
  "`$schema": "https://opencode.ai/config.json",
  "provider": {
    "fabrix": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "FabriX Bridge",
      "options": {
        "baseURL": "$localBaseUrl",
$apiKeyLine        "timeout": 600000
      },
      "models": {
        "default": {
          "name": "FabriX Bridge (Default)"
        }
      }
    }
  },
  "model": "fabrix/default",
  "small_model": "fabrix/default"
}
"@
}

function Update-RunningView($config) {
  $selected = $script:modelCatalog | Where-Object { $_.modelId -eq $config.SelectedModelId } | Select-Object -First 1
  if (-not $selected) {
    $selected = $script:modelCatalog | Select-Object -First 1
  }

  $localBaseUrl = "http://{0}:{1}/v1" -f $config.BridgeHost, $config.BridgePort
  $controls.RunningBaseUrlText.Text = $localBaseUrl
  $controls.RunningModelText.Text = $selected.displayName
  $controls.SummaryBaseUrlText.Text = "{0}{1}" -f $config.BaseUrl, $config.ChatPath
  $controls.SummaryModelsPathText.Text = $config.ModelsPath
  $controls.SummaryBridgeText.Text = "{0}:{1}" -f $config.BridgeHost, $config.BridgePort
  $controls.SummaryBridgeTokenText.Text = if ($config.BridgeToken) { "설정됨" } else { "미사용" }
  $controls.SnippetTextBox.Text = Build-OpenCodeSnippet $localBaseUrl $config.BridgeToken
}

function Load-ModelsIntoState($models) {
  $script:modelCatalog = @($models)
  $state.ModelsLoaded = $script:modelCatalog.Count -gt 0
  if (-not $state.SelectedModelId -and $state.ModelsLoaded) {
    $state.SelectedModelId = [int]$script:modelCatalog[0].modelId
  }
  Render-Models
}

function Load-FabriXModels {
  $controls.ModelHintCard.Visibility = "Collapsed"
  $controls.LoadingCard.Visibility = "Visible"
  $controls.ModelWrapPanel.Children.Clear()
  $window.UpdateLayout()

  try {
    $models = Fetch-FabriXModels
    if (-not $state.SelectedModelId) {
      $state.SelectedModelId = [int]$models[0].modelId
    }
    Load-ModelsIntoState $models
    Set-Toast "SetupToastText" "모델 목록을 불러왔습니다."
  }
  finally {
    $controls.LoadingCard.Visibility = "Collapsed"
  }
}

function Show-SetupState([string]$message = "") {
  Set-StepState "setup"
  Set-Toast "RunningToastText" ""
  Set-Toast "SetupToastText" $message
}

function Show-RunningState([string]$message = "") {
  Set-StepState "running"
  Set-Toast "SetupToastText" ""
  Set-Toast "RunningToastText" $message
}

function Get-VisibleDescendants($root) {
  $result = New-Object System.Collections.Generic.List[object]
  $queue = New-Object System.Collections.Queue
  $queue.Enqueue($root)

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $count = [System.Windows.Media.VisualTreeHelper]::GetChildrenCount($current)
    for ($i = 0; $i -lt $count; $i++) {
      $child = [System.Windows.Media.VisualTreeHelper]::GetChild($current, $i)
      if ($child -and $child.Visibility -eq [System.Windows.Visibility]::Visible) {
        $result.Add($child)
        $queue.Enqueue($child)
      }
    }
  }

  return $result
}

function Invoke-LayoutCheck {
  $root = if ($PreviewState -eq "running") { $controls.RunningPanel } else { $controls.SetupPanel }
  $window.Show()
  $window.Activate() | Out-Null
  Start-Sleep -Milliseconds 250
  $window.UpdateLayout()

  $issues = New-Object System.Collections.Generic.List[string]
  foreach ($node in (Get-VisibleDescendants $root)) {
    if ($node -is [System.Windows.Controls.TextBlock] -and $node.Text) {
      $node.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
      $desired = $node.DesiredSize
      if ($node.TextWrapping -eq [System.Windows.TextWrapping]::NoWrap) {
        if (($desired.Width - $node.ActualWidth) -gt 6) {
          $issues.Add("TextBlock clipped: " + $node.Text)
        }
      }
      elseif (($desired.Height - $node.ActualHeight) -gt 6) {
        $issues.Add("Wrapped TextBlock clipped: " + $node.Text)
      }
    }

    if ($node -is [System.Windows.Controls.Button] -and ($node.Content -is [string])) {
      $node.Measure([System.Windows.Size]::new([double]::PositiveInfinity, [double]::PositiveInfinity))
      if (($node.DesiredSize.Width - $node.ActualWidth) -gt 8) {
        $issues.Add("Button clipped: " + [string]$node.Content)
      }
    }

    $parent = [System.Windows.Media.VisualTreeHelper]::GetParent($node)
    if ($node -is [System.Windows.Controls.ScrollViewer] -and $parent -eq $root -and $node.ComputedVerticalScrollBarVisibility -eq [System.Windows.Visibility]::Visible) {
      $issues.Add("Scroll required in visible panel")
    }
  }

  $window.Close()
  if ($issues.Count -gt 0) {
    $issues
    exit 1
  }

  "LAYOUT OK: $PreviewState"
  return
}

function Reset-Form {
  Set-Defaults
  $controls.FabrixClientTextBox.Text = ""
  $controls.FabrixTokenTextBox.Password = ""
  $state.SelectedModelId = $null
  $state.ModelsLoaded = $false
  $script:modelCatalog = @()
  $controls.ModelWrapPanel.Children.Clear()
  $controls.ModelHintCard.Visibility = "Visible"
  Set-SavedBadge (Test-Path $ConfigPath)
  Set-Toast "SetupToastText" "입력값을 초기화했습니다."
}

function Load-SavedConfiguration {
  $saved = Read-ConfigFile
  if (-not $saved) {
    return
  }

  Set-CurrentConfig $saved
  $normalized = @()
  foreach ($item in @($saved.cache.models)) {
    $normalizedModel = [pscustomobject]@{
      modelId = [int]$item.modelId
      modelGuid = [string]$item.modelGuid
      alias = [string]$item.alias
      displayName = [string]$item.displayName
      description = [string]$item.description
      names = @($item.names)
      descriptions = @($item.descriptions)
    }
    if ($normalizedModel.modelId -gt 0) {
      $normalized += $normalizedModel
    }
  }

  if ($normalized.Count -gt 0) {
    Load-ModelsIntoState $normalized
  }

  $state.ConfigLoaded = $true
  Set-SavedBadge $true
}

function Wait-BridgeReady($config) {
  $deadline = (Get-Date).AddSeconds(8)
  $url = "http://{0}:{1}/healthz" -f $config.BridgeHost, $config.BridgePort

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2
      if ($response.ok -eq $true) {
        return $true
      }
    }
    catch {
    }
    Start-Sleep -Milliseconds 250
  }

  return $false
}

function Stop-BridgeServer {
  if ($state.ServerProcess -and -not $state.ServerProcess.HasExited) {
    try {
      $state.ServerProcess.Kill()
      $state.ServerProcess.WaitForExit(2000) | Out-Null
    }
    catch {
    }
  }
  $state.ServerProcess = $null
}

function Start-BridgeServer($config) {
  Stop-BridgeServer

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $startInfo.WorkingDirectory = Split-Path -Parent $AppJsPath
  $useExecutableEntry = $AppJsPath -and $AppJsPath.ToLowerInvariant().EndsWith(".exe")
  if ($useExecutableEntry) {
    $startInfo.FileName = $AppJsPath
    $startInfo.Arguments = @(
      "serve",
      "--config",
      (Quote-Argument $ConfigPath)
    ) -join " "
  }
  else {
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = @(
      (Quote-Argument $AppJsPath),
      "serve",
      "--config",
      (Quote-Argument $ConfigPath)
    ) -join " "
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $process.EnableRaisingEvents = $true

  $process.add_OutputDataReceived({
    if ($_.Data) {
      $message = $_.Data
      $window.Dispatcher.BeginInvoke([action]{
        Set-Toast "RunningToastText" $message
      }) | Out-Null
    }
  })

  $process.add_ErrorDataReceived({
    if ($_.Data) {
      $message = $_.Data
      $window.Dispatcher.BeginInvoke([action]{
        Set-Toast "RunningToastText" $message
      }) | Out-Null
    }
  })

  $null = $process.Start()
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  $state.ServerProcess = $process

  if (-not (Wait-BridgeReady $config)) {
    throw "브리지 서버가 제시간에 시작되지 않았습니다."
  }
}

function Copy-SnippetToClipboard {
  try {
    [System.Windows.Clipboard]::SetText($controls.SnippetTextBox.Text)
    Set-Toast "RunningToastText" "OpenCode 설정을 복사했습니다."
  }
  catch {
    Set-Toast "RunningToastText" "복사에 실패했습니다."
  }
}

function Invoke-SelfTest {
  if (-not $SelfTestBaseUrl) {
    throw "SelfTestBaseUrl 값이 필요합니다."
  }

  Reset-Form
  $controls.BaseUrlTextBox.Text = $SelfTestBaseUrl
  $controls.ChatPathTextBox.Text = "/chat/completions"
  $controls.ModelsPathTextBox.Text = "/v1/models"
  $controls.FabrixClientTextBox.Text = $SelfTestClient
  $controls.FabrixTokenTextBox.Password = $SelfTestToken
  $controls.BridgeHostTextBox.Text = "127.0.0.1"
  $controls.BridgePortTextBox.Text = "4011"
  Sync-HeaderPills

  Load-FabriXModels
  if (-not $state.ModelsLoaded) {
    throw "모델 로딩에 실패했습니다."
  }

  $config = Get-CurrentConfig
  $configObject = Build-ConfigObject $script:modelCatalog
  Write-ConfigFile $configObject
  Start-BridgeServer $config

  try {
    $modelsResponse = Invoke-RestMethod -Uri "http://127.0.0.1:4011/v1/models" -Method Get -TimeoutSec 4
    if (-not $modelsResponse.data -or $modelsResponse.data.Count -lt 1) {
      throw "브리지 /v1/models 응답이 비어 있습니다."
    }

    $body = @{
      model = "default"
      messages = @(
        @{ role = "user"; content = "hello" }
      )
    } | ConvertTo-Json -Depth 10

    $chatResponse = Invoke-RestMethod -Uri "http://127.0.0.1:4011/v1/chat/completions" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 6
    if (-not $chatResponse.choices -or -not $chatResponse.choices[0].message.content) {
      throw "브리지 /v1/chat/completions 응답이 비어 있습니다."
    }
  }
  finally {
    Stop-BridgeServer
  }

  "SELFTEST OK"
  return
}

$controls.BridgeHostTextBox.Add_TextChanged({ Sync-HeaderPills })
$controls.BridgePortTextBox.Add_TextChanged({ Sync-HeaderPills })
$controls.ChatPathTextBox.Add_TextChanged({ Sync-HeaderPills })

Set-Defaults
Set-SavedBadge $false
Load-SavedConfiguration
if ($PreviewState -eq "running") {
  if (-not $state.ModelsLoaded) {
    Load-ModelsIntoState $sampleModels
    $state.SelectedModelId = 16
  }
  Update-RunningView (Get-CurrentConfig)
  Show-RunningState
}
else {
  Show-SetupState
}

$controls.LoadModelsButton.Add_Click({
  try {
    Load-FabriXModels
  }
  catch {
    Set-Toast "SetupToastText" $_.Exception.Message
  }
})

$controls.PrefillButton.Add_Click({
  Reset-Form
})

$controls.StartButton.Add_Click({
  $config = Get-CurrentConfig
  if (-not $config.FabrixClient -or -not $config.FabrixToken) {
    Set-Toast "SetupToastText" "client 값과 token 값을 입력하세요."
    return
  }
  if (-not $state.ModelsLoaded -or -not $config.SelectedModelId) {
    Set-Toast "SetupToastText" "모델을 먼저 불러오고 선택하세요."
    return
  }

  try {
    $configObject = Build-ConfigObject $script:modelCatalog
    Write-ConfigFile $configObject
    Sync-HeaderPills
    Start-BridgeServer $config
    Update-RunningView $config
    Set-SavedBadge $true
    Show-RunningState "브리지 서버가 실행 중입니다."
  }
  catch {
    Set-Toast "SetupToastText" $_.Exception.Message
  }
})

$controls.ReopenButton.Add_Click({
  Show-SetupState "설정 화면으로 돌아왔습니다."
})

$controls.ShutdownButton.Add_Click({
  Stop-BridgeServer
  $controls.WindowStatusText.Text = "설정 대기"
  Set-Toast "RunningToastText" "브리지 서버를 종료했습니다."
})

$controls.CopyButton.Add_Click({
  Copy-SnippetToClipboard
})

if ($LayoutCheck) {
  try {
    Invoke-LayoutCheck | Write-Output
    exit 0
  }
  catch {
    Write-Error $_
    exit 1
  }
}

if ($SelfTest) {
  try {
    Invoke-SelfTest | Write-Output
    exit 0
  }
  catch {
    Write-Error $_
    exit 1
  }
}

if ($SmokeTest) {
  Write-Output "OK"
  exit 0
}

$window.Add_Closing({
  Stop-BridgeServer
})

[void]$window.ShowDialog()
