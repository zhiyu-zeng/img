---
title: 定位SystemUi控件的普适方法
source: https://yuuki.cool/posts/hooksystemui/
source_host: yuuki.cool
clip_date: 2026-08-04T10:38:24+08:00
trace_id: 263e2301-8d91-4c05-bc1f-3317faa31d84
content_hash: 61bc1b5c6a68e566aa5b2e35d35f201827bb5f11710da61a41a19ad991e98874
status: synced
tags:
  - Android逆向
  - Hook
series: null
feed_source: Yuuki·移动安全
ai_summary: |-
  通过 Xposed 动态隐藏布局子视图并结合二分法，可高效定位 SystemUI 中未知控件及其对应 XML 文件。
  - **方法核心：** 利用 Xposed 框架 hook 目标应用的布局文件，遍历并隐藏所有子视图，通过观察界面消失区域来判断控件功能。
  - **实现步骤：** 先解压 APK 的 layout 目录，用 AI 按前缀分类 XML 文件；然后对所有可疑文件执行 hook 隐藏子视图，再通过二分法逐步注释列表，反复重启验证来精确锁定目标。
  - **关键技巧：** 采用二分查找策略缩小 XML 范围，避免静态逐一分析，显著提升逆向效率。
  - **局限性：** 频繁重启可能导致手机发热，AI 在处理大量文件时可能分类不细致，但整体仍胜过传统人工猜测。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8152-ad0d-c7cb9b5198f8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 Xposed 动态隐藏布局子视图并结合二分法，可高效定位 SystemUI 中未知控件及其对应 XML 文件。
> - **方法核心：** 利用 Xposed 框架 hook 目标应用的布局文件，遍历并隐藏所有子视图，通过观察界面消失区域来判断控件功能。
> - **实现步骤：** 先解压 APK 的 layout 目录，用 AI 按前缀分类 XML 文件；然后对所有可疑文件执行 hook 隐藏子视图，再通过二分法逐步注释列表，反复重启验证来精确锁定目标。
> - **关键技巧：** 采用二分查找策略缩小 XML 范围，避免静态逐一分析，显著提升逆向效率。
> - **局限性：** 频繁重启可能导致手机发热，AI 在处理大量文件时可能分类不细致，但整体仍胜过传统人工猜测。

## 0x01: 前言

在完善 [BetterBar](https://github.com/SoyBeanMilkx/BetterBar) 的时候，想要快速定位某个控件的位置，搞清楚每个控件的作用。由于不知道系统应用应该如何动态调试，所以之前都是根据类名猜个大概，然后去对应View的 **onxxx** 函数里去创建view或者修改该view的背景为红色，这样比较醒目，如果打开手机对应位置看到了红色，说明定位到了。

但这种方式太低效了，首先Systemui里有很多类是没用的，而且有许多命名相似的类，所以前期开发苦不堪言。好在之前运气不错，记录了许多类对应的功能。但是今天突然想要修改xml里的某个控件的属性：

```kotlin
override fun handleInitPackageResources(resparam: XC_InitPackageResources.InitPackageResourcesParam) {
        resparam.res.hookLayout("com.android.systemui", "layout", "control_center", object : XC_LayoutInflated() {
            override fun handleLayoutInflated(liparam: LayoutInflatedParam) {
                // 获取根视图 ControlCenterPanelView
                val rootView = liparam.view as ViewGroup

                val childView = rootView.getChildAt(0)
                childView.visibility = View.GONE

            }
        })
    }
```

这段代码很简单，就是在隐藏control_cente.xml中根布局下的第一个控件。写完之后对应位置的view显著的消失了，到这里我突发奇想，那如果我直接把所有子视图都隐藏了，那是不是就能快速定位到这个xml的作用了呢，如果xml功能符合我们的预期，那我们就能进而分析子控件对应的功能了！

## 0x02: 开干

说干就干，代码也只要稍作修改即可：

```kotlin

override fun handleInitPackageResources(resparam: XC_InitPackageResources.InitPackageResourcesParam) {
        resparam.res.hookLayout("com.android.systemui", "layout", "control_center", object : XC_LayoutInflated() {
            override fun handleLayoutInflated(liparam: LayoutInflatedParam) {
                // 获取根视图 ControlCenterPanelView
                val rootView = liparam.view as ViewGroup

                // 遍历所有子视图并隐藏
                for (i in 0 until rootView.childCount) {
                    val childView = rootView.getChildAt(i)
                    childView.visibility = View.GONE
                }
            }
        })

    }
```

这样之后，一大片布局都消失了，确实符合预期。但是SystemUi里这么多xml，该如何确定想要的具体是哪个xml呢？

那当然是 **穷举 + 二分**，我们可以借助伟大的ai!，直接把 **apk/res/layout** 解压出来，比如解压到 **Download/layout** 下了,那么我们直接：

```
cd Download/layout
ls
```

我们把得到的所有xml名都复制丢给ai，并且让他按照命名分类(以SystemUi举例，里面有很多以status, notification...开头的xml，按照名字前缀分类即可)，然后分别取隐藏每个xml的子视图，这样我们hook之后，重启SystemUi会发现一堆东西都缺失了。那么接下来我们该怎么定位呢？

## 0x03: 伟大的二分法

如题所言，我们可以使用二分法。比如我的代码是这样的：

```kotlin
        val statusXmls = listOf(
            "status_bar",
            "status_bar_expanded",
            "status_bar_expanded_plugin_frame",
            "status_bar_hot_zone_guide",
            "status_bar_mobile_signal_group",
            "status_bar_mobile_signal_group_inner",
            "status_bar_mobile_signal_group_new",
            "status_bar_no_notifications",
            "status_bar_notification_footer",
            "status_bar_notification_row",
            "status_bar_notification_section_header",
            "status_bar_notification_shelf",
            "status_bar_ticker",
            "status_bar_ticker_ext",
            "status_bar_user_chip_container",
            "status_bar_wifi_group",
            "status_bar_wifi_group_inner"
        )

        // 遍历列表，对每个 xml 文件进行 Hook
        for (xmlName in statusXmls) {
            resparam.res.hookLayout("com.android.systemui", "layout", xmlName, object : XC_LayoutInflated() {
                override fun handleLayoutInflated(liparam: LayoutInflatedParam) {
                    // 获取根视图
                    val rootView = liparam.view as ViewGroup
                    // 遍历所有子视图并隐藏
                    for (i in 0 until rootView.childCount) {
                        val childView = rootView.getChildAt(i)
                        childView.visibility = View.GONE
                    }
                }
            })
        }
```

我们可以先注释掉 **statusXmls** 的下半部分，接着继续查看对应控件是否被隐藏，如果依旧被隐藏，说明我们需要的xml还在上半部分，然后我们再次注释上半部分的一半，继续查看，以此类推...这是典型的二分查找，比之前静态分析效率高很多，就是手机容易红温，我试了几次手机就发烫了。工程量小可以自己写，工程量大的话还是使用ai大法吧。

不过东西多了ai就开始偷懒了

```kotlin
        // 菜单相关 XML 文件列表
        val menuXmls = listOf(
            "abc_action_bar_title_item", "abc_action_menu_item_layout", "abc_action_menu_layout",
            "abc_action_mode_bar", "abc_action_mode_close_item_material", "abc_cascading_menu_item_layout",
            "abc_expanded_menu_layout", "abc_list_menu_item_checkbox", "abc_list_menu_item_icon",
            "abc_list_menu_item_layout", "abc_list_menu_item_radio", "abc_popup_menu_header_item_layout",
            "abc_popup_menu_item_layout", "mz_abc_action_menu_layout", "mz_abc_action_mode_bar",
            "mz_action_bar_drop_down_view", "mz_action_bar_title_item", "mz_action_menu_item_layout",
            "mz_action_menu_item_split_layout", "mz_action_multi_choice_mode_close_item",
            "mz_action_multi_choice_mode_select_all_item", "mz_expanded_menu_layout",
            "mz_list_menu_item_icon", "mz_list_menu_item_layout", "mz_popup_menu_item_layout"
        )

        // 对话框相关 XML 文件列表
        val dialogXmls = listOf(
            "abc_alert_dialog_button_bar_material", "abc_alert_dialog_material",
            "abc_alert_dialog_title_material", "abc_dialog_title_material", "abc_select_dialog_material",
            "grant_admin_dialog_content", "mr_cast_dialog", "mr_chooser_dialog", "mr_controller_material_dialog_b",
            "mr_picker_dialog", "mtrl_alert_dialog", "mtrl_alert_dialog_actions", "mtrl_alert_dialog_title",
            "mtrl_alert_select_dialog_item", "mtrl_alert_select_dialog_multichoice",
            "mtrl_alert_select_dialog_singlechoice", "mz_alert_dialog_appcompat", "mz_alert_dialog_button_bar",
            "alert_dialog_button_bar_systemui", "alert_dialog_systemui", "alert_dialog_title_systemui",
            "scrollable_alert_dialog_systemui", "loading_alert_dialog", "dialog_with_icon",
            "privacy_dialog", "privacy_dialog_item", "zen_mode_turn_on_dialog_container",
            "zen_mode_duration_dialog", "controls_detail_dialog", "controls_dialog", "controls_dialog_pin",
            "media_session_end_dialog", "media_output_dialog", "media_output_broadcast_update_dialog",
            "font_scaling_dialog", "contrast_dialog", "long_screenshot", "full_screen_permission_circle",
            "broadcast_dialog", "letterbox_education_dialog_layout", "letterbox_education_dialog_action_layout",
            "letterbox_restart_dialog_layout", "log_access_user_consent_dialog_permission",
            "user_creation_progress_dialog", "edit_user_info_dialog_content"
        )

        // 状态栏相关 XML 文件列表
        val statusBarXmls = listOf(
            "status_bar", "status_bar_expanded", "status_bar_expanded_plugin_frame",
            "status_bar_hot_zone_guide", "status_bar_mobile_signal_group", "status_bar_mobile_signal_group_inner",
            "status_bar_mobile_signal_group_new", "status_bar_no_notifications", "status_bar_notification_footer",
            "status_bar_notification_row", "status_bar_notification_section_header",
            "status_bar_notification_shelf", "status_bar_ticker", "status_bar_ticker_ext",
            "status_bar_user_chip_container", "status_bar_wifi_group", "status_bar_wifi_group_inner",
            "new_status_bar_wifi_group", "control_center_status_bar", "super_status_bar"
        )

        // 锁屏相关 XML 文件列表
        val keyguardXmls = listOf(
            "keyguard_bottom_area", "keyguard_bottom_area_overlay", "keyguard_bouncer_message_area",
            "keyguard_bouncer_status_bar", "keyguard_bouncer_user_switcher",
            "keyguard_bouncer_user_switcher_item", "keyguard_clock_switch", "keyguard_emergency_carrier_area",
            "keyguard_media_container", "keyguard_message_area", "keyguard_num_pad_key",
            "keyguard_palm_rejection_layout", "keyguard_pattern_view", "keyguard_pin_shape_hinting_view",
            "keyguard_pin_shape_non_hinting_view", "keyguard_presentation", "keyguard_qs_user_switch",
            "keyguard_screen_findphone_portrait", "keyguard_security_container_view",
            "keyguard_settings_popup_menu", "keyguard_slice_view", "keyguard_status_bar",
            "keyguard_status_view", "keyguard_user_switcher", "keyguard_user_switcher_item",
            "mz_keyguard_bottom_area", "mz_keyguard_bouncer_frame", "mz_keyguard_emergency_carrier_area",
            "mz_keyguard_emergency_carrier_area_pin_puk", "mz_keyguard_password_view",
            "mz_keyguard_pin_view", "mz_keyguard_sim_pin_view", "mz_keyguard_sim_puk_view",
            "mz_keyguard_screen_weather_and_date_widget", "mz_keyguard_screen_weather_and_date_widget_core",
            "mz_keyguard_screen_weather_and_date_widget_core_from_editor"
        )

        // 通知相关 XML 文件列表
        val notificationXmls = listOf(
            "notification_children_container", "notification_children_divider",
            "notification_conversation_info", "notification_filter_panel", "notification_group_collapse",
            "notification_gut_setting_view", "notification_guts", "notification_guts_f9",
            "notification_icon_area", "notification_info", "notification_media_action",
            "notification_media_cancel_action", "notification_snooze", "notification_snooze_option",
            "notification_stack_scroll_layout", "notification_template_big_media",
            "notification_template_big_media_custom", "notification_template_big_media_narrow",
            "notification_template_big_media_narrow_custom", "notification_template_lines_media",
            "notification_template_media", "notification_template_media_custom",
            "notification_template_part_chronometer", "notification_template_part_time",
            "super_notification_shade", "notif_half_shelf", "notif_half_shelf_row",
            "ongoing_call_chip", "ongoing_privacy_chip", "flyme_ongoing_privacy_chip",
            "aosp_ongoing_privacy_chip", "tv_ongoing_privacy_chip"
        )

        // 其他 XML 文件列表
        val otherXmls = listOf(
            "home", "home_handle", "hybrid_conversation_notification", "hybrid_notification",
            "hybrid_overflow_number", "illustration_preference", "image_frame", "ime_switcher",
            "inattentive_sleep_warning", "internet_connectivity_dialog", "internet_list_item",
            "invocation_lights", "item_clock_style", "keyboard_shortcut_app_item",
            "keyboard_shortcuts_category_separator", "keyboard_shortcuts_category_short_separator",
            "keyboard_shortcuts_category_title", "keyboard_shortcuts_container",
            "keyboard_shortcuts_key_icon_view", "keyboard_shortcuts_key_new_icon_view",
            "keyboard_shortcuts_key_new_view", "keyboard_shortcuts_key_plus_view",
            "keyboard_shortcuts_key_vertical_bar_view", "keyboard_shortcuts_key_view",
            "keyboard_shortcuts_search_view", "keyboard_shortcuts_view", "lb_action_1_line",
            "lb_action_2_lines", "lb_browse_fragment", "lb_browse_title", "lb_control_bar",
            "lb_control_button_primary", "lb_control_button_secondary", "lb_details_description",
            "lb_details_fragment", "lb_details_overview", "lb_divider", "lb_error_fragment",
            "lb_fullwidth_details_overview", "lb_fullwidth_details_overview_logo", "lb_guidance",
            "lb_guidedactions", "lb_guidedactions_datepicker_item", "lb_guidedactions_item",
            "lb_guidedbuttonactions", "lb_guidedstep_background", "lb_guidedstep_fragment",
            "lb_header", "lb_headers_fragment", "lb_image_card_view",
            "lb_image_card_view_themed_badge_left", "lb_image_card_view_themed_badge_right",
            "lb_image_card_view_themed_content", "lb_image_card_view_themed_title", "lb_list_row",
            "lb_list_row_hovercard", "lb_media_item_number_view_flipper", "lb_media_list_header",
            "lb_onboarding_fragment", "lb_picker", "lb_picker_column", "lb_picker_item",
            "lb_picker_separator", "lb_pinpicker_item", "lb_playback_controls",
            "lb_playback_controls_row", "lb_playback_fragment", "lb_playback_now_playing_bars",
            "lb_playback_transport_controls_row", "lb_row_container", "lb_row_header",
            "lb_row_media_item", "lb_row_media_item_action", "lb_rows_fragment", "lb_search_bar",
            "lb_search_fragment", "lb_search_orb", "lb_section_header", "lb_shadow",
            "lb_speech_orb", "lb_title_view", "lb_vertical_grid", "lb_vertical_grid_fragment",
            "lb_video_surface", "mc_badge_view_image_item", "mc_badge_view_point_view_item",
            "mc_badge_view_text_item", "mc_content_toast_layout_light", "mc_custom_date_picker",
            "mc_custom_date_picker_dialog", "mc_custom_picker_24hour", "mc_date_picker",
            "mc_date_picker_base", "mc_date_picker_day_time_dialog", "mc_date_picker_day_time_layout",
            "mc_date_picker_dialog", "mc_date_picker_native_dialog", "mc_empty_view",
            "mc_expandable_preference_layout", "mc_expandable_preference_list_item",
            "mc_guide_popup_window", "mc_install_progress_bar_layout", "mc_layout_password_input",
            "mc_letter_overlay", "mc_list_category_contact_partition_header", "mc_move_search_layout",
            "mc_pinned_group_header", "mc_pinned_header_view", "mc_preference_widget_switch",
            "mc_search_layout", "mc_selection_button", "mc_slide_notice_content",
            "mc_stretch_search_layout", "mc_stretch_search_layout_ext", "mc_time_picker_column_12",
            "mc_time_picker_column_24", "mc_time_picker_dialog", "mc_toast_layout",
            "mc_weekday_picker_item", "media_carousel", "media_carousel_settings_button",
            "media_controller_switch_view", "media_controller_switch_view_area",
            "media_long_press_menu", "media_output_broadcast_area", "media_projection_app_selector",
            "media_projection_recent_tasks", "media_projection_task_item", "media_recommendation_view",
            "media_recommendations", "media_session_view", "media_smartspace_recommendations",
            "media_ttt_chip_receiver", "menu_ime", "misc_tile_layout", "nav_key_space",
            "navigation_bar", "navigation_bar_window", "navigation_layout", "navigation_layout_vertical",
            "new_status_bar_wifi_group", "operator_name", "overlay_action_chip",
            "panel_hot_zone_guide", "partial_conversation_info", "partner_customization_layout",
            "people_space_activity", "people_space_activity_list_divider",
            "people_space_activity_no_conversations", "people_space_activity_with_conversations",
            "people_space_placeholder_layout", "people_space_tile_view", "people_status_scrim_layout",
            "people_tile_emoji_background_large", "people_tile_emoji_background_medium",
            "people_tile_large_empty", "people_tile_large_with_content",
            "people_tile_large_with_notification_content", "people_tile_large_with_status_content",
            "people_tile_medium_empty", "people_tile_medium_with_content",
            "people_tile_punctuation_background_large", "people_tile_punctuation_background_medium",
            "people_tile_small", "people_tile_small_horizontal", "people_tile_suppressed_layout",
            "people_tile_with_suppression_detail_content_horizontal",
            "people_tile_with_suppression_detail_content_vertical",
            "people_tile_work_profile_quiet_layout", "photo_preview_overlay", "pip_menu",
            "pip_menu_action", "power_notification_controls_settings", "preference",
            "preference_category", "preference_category_material", "preference_dialog_edittext",
            "preference_dropdown", "preference_dropdown_material", "preference_list_fragment",
            "preference_material", "preference_recyclerview", "preference_usage_progress_bar",
            "preference_widget_checkbox", "preference_widget_primary_switch",
            "preference_widget_radiobutton", "preference_widget_seekbar",
            "preference_widget_seekbar_material", "preference_widget_switch",
            "preference_widget_switch_compat", "quick_access_wallet", "quick_settings_brightness_dialog",
            "quick_settings_footer_dialog", "quick_settings_footer_dialog_parental_controls",
            "quick_status_bar_expanded_header", "reachability_ui_layout", "recent_apps",
            "remote_input", "restricted_switch_widget", "rotate_suggestion",
            "screen_decor_hwc_layer", "screen_pinning_request", "screen_pinning_request_buttons",
            "screen_pinning_request_buttons_land", "screen_pinning_request_buttons_sea",
            "screen_pinning_request_land_phone", "screen_pinning_request_sea_phone",
            "screen_pinning_request_text_area", "screen_record_dialog",
            "screen_record_dialog_audio_source", "screen_record_dialog_audio_source_selected",
            "screen_record_options", "screen_share_dialog", "screen_share_dialog_spinner_item_text",
            "screen_share_dialog_spinner_text", "screenshot", "screenshot_detection_notice",
            "screenshot_notification_share_and_delete", "screenshot_static",
            "screenshot_work_profile_first_run", "settings_bar_chart", "settings_bar_view",
            "settings_spinner_preference", "settingslib_button_layout", "settingslib_main_switch_layout",
            "shade_carrier", "shade_carrier_group", "sidefps_view", "slice_permission_request",
            "smart_action_button", "smart_reply_button", "smart_reply_view", "smarttouch_help",
            "smarttouch_mainviewgroup", "split_decor", "split_divider", "status_bar_no_notifications",
            "support_simple_spinner_dropdown_item", "switch_bar", "system_event_animation_window",
            "system_icons", "tab_fragment", "text_toast", "tile_service_request_dialog",
            "toast_low_power", "tuner_activity", "tuner_shortcut_item", "tuner_shortcut_list",
            "tuner_widget_settings_switch", "tv_bottom_sheet", "tv_notification_item",
            "tv_notification_panel", "tv_pip_menu", "tv_pip_menu_background",
            "tv_privacy_chip_container", "tv_split_menu_view", "tv_window_menu_action_button",
            "udfps_fpm_empty_view", "udfps_keyguard_preview", "udfps_keyguard_view_internal",
            "udfps_keyguard_view_legacy", "udfps_view", "user_switcher_fullscreen",
            "user_switcher_fullscreen_item", "user_switcher_fullscreen_popup_item",
            "volume_dialog", "volume_dialog_row", "volume_dnd_icon", "volume_panel",
            "volume_panel_dialog", "volume_panel_item", "volume_panel_slice_slider_row",
            "volume_panel_sub", "volume_ringer_drawer", "volume_tool_tip_view", "wallet_card_view",
            "wallet_empty_state", "wallet_fullscreen", "wallpaper_text", "window_magnification_settings_view",
            "window_magnifier_view", "wiredcharge_layout", "wireless_charging_layout",
            "world_clock_view", "zen_mode_condition", "zen_mode_radio_button"
        )

        // 隐藏指定 XML 文件子视图的函数
        fun hideXmlChildren(xmlNames: List<String>) {
            for (xmlName in xmlNames) {
                resparam.res.hookLayout("com.android.systemui", "layout", xmlName, object : XC_LayoutInflated() {
                    override fun handleLayoutInflated(liparam: LayoutInflatedParam) {
                        val rootView = liparam.view as ViewGroup
                        for (i in 0 until rootView.childCount) {
                            val childView = rootView.getChildAt(i)
                            childView.visibility = View.GONE
                        }
                    }
                })
            }
        }

// 隐藏菜单相关 XML 文件的子视图
        //hideXmlChildren(menuXmls)
// 隐藏对话框相关 XML 文件的子视图
        //hideXmlChildren(dialogXmls)
// 隐藏状态栏相关 XML 文件的子视图
        //hideXmlChildren(statusBarXmls)
// 隐藏锁屏相关 XML 文件的子视图
        //hideXmlChildren(keyguardXmls)
// 隐藏通知相关 XML 文件的子视图
        //hideXmlChildren(notificationXmls)
// 隐藏其他 XML 文件的子视图
        //hideXmlChildren(otherXmls)
```

可以看到下面他已经懒得分类了哈哈哈哈哈哈哈

## 0x04: 小结

虽然是笨方法，但起码是找到了各个场景通用的解决方案:)

周末快乐!
